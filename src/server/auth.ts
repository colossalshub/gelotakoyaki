import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { passwordError, normalizeEmail } from "@/domain/password";
import type { Actor, BranchAccess } from "@/domain/permissions";
import { audit } from "@/server/audit";
import { bootstrapReferenceData } from "@/server/bootstrap";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

const SESSION_COOKIE = "gelos_session";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export { SESSION_COOKIE };

function rounds(): number {
  if (process.env.NODE_ENV === "production") return 12;
  const parsed = Number(process.env.BCRYPT_ROUNDS ?? 12);
  if (!Number.isInteger(parsed) || parsed < 4 || parsed > 14) return 12;
  return parsed;
}

function requireSecret(): void {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32 || secret.includes("replace-with")) {
    throw new AppError("The server is missing a session secret.", "CONFIG", 500);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const problem = passwordError(password);
  if (problem) throw new AppError(problem, "PASSWORD");
  return bcrypt.hash(password, rounds());
}

export async function toActor(user: User & { branches: BranchAccess[] }): Promise<Actor> {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    branches: user.branches,
  };
}

async function loadActorById(userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { branches: true } });
  if (!user || !user.active) return null;
  return toActor(user);
}

export async function registerInitialOwner(input: { name: string; email: string; password: string }) {
  requireSecret();
  const existing = await prisma.user.count();
  if (existing > 0) {
    throw new AppError("An account already exists. Sign in and add people from Settings.", "EXISTS");
  }
  await bootstrapReferenceData();
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      passwordHash,
      role: "OWNER",
      mustChangePassword: false,
    },
  });
}

export async function login(input: { email: string; password: string; ip: string; remember: boolean }) {
  requireSecret();
  const email = normalizeEmail(input.email);
  const key = `${email}|${input.ip || "unknown"}`;
  const since = new Date(Date.now() - WINDOW_MS);
  const attempts = await prisma.loginAttempt.count({ where: { key, createdAt: { gte: since } } });
  if (attempts >= MAX_ATTEMPTS) {
    throw new AppError("Too many sign-in attempts. Wait 15 minutes and try again.", "RATE_LIMIT", 429);
  }
  const user = await prisma.user.findUnique({ where: { email }, include: { branches: true } });
  const hash = user?.passwordHash ?? (await bcrypt.hash("not-a-real-password", rounds()));
  const match = await bcrypt.compare(input.password, hash);
  if (!user || !user.active || !match) {
    await prisma.loginAttempt.create({ data: { key } });
    throw new AppError("Email or password is not correct.", "AUTH", 401);
  }
  await prisma.loginAttempt.deleteMany({ where: { key } });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const hours = input.remember ? 24 * 7 : 12;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt } });
  await audit(prisma, {
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  return { token, expiresAt, actor: await toActor(user) };
}

export async function actorFromToken(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return loadActorById(session.userId);
}

export async function logout(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function changePassword(actor: Actor, currentPassword: string, nextPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user) throw new AppError("Account not found.", "NOT_FOUND", 404);
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new AppError("The current password is not correct.", "AUTH", 401);
  const passwordHash = await hashPassword(nextPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.deleteMany({ where: { userId: actor.id } });
    await audit(tx, { userId: actor.id, action: "auth.password", entityType: "user", entityId: actor.id });
  });
}
