import type { UserRole } from "@prisma/client";
import type { Actor, BranchAccess } from "@/domain/permissions";
import { normalizeEmail } from "@/domain/password";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth";
import { assertCan } from "@/server/authz";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

export async function createStaffUser(
  actor: Actor,
  input: {
    name: string;
    email: string;
    password: string;
    role: Extract<UserRole, "BRANCH_MANAGER" | "STAFF">;
    branches: BranchAccess[];
  },
) {
  assertCan(actor, "users.manage");
  if (!input.name.trim()) throw new AppError("Enter the person's name.");
  if (!input.branches.length) throw new AppError("Assign at least one branch.");
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: normalizeEmail(input.email),
        passwordHash,
        role: input.role,
        mustChangePassword: true,
        branches: { create: input.branches.map(branchData) },
      },
    });
  } catch {
    throw new AppError("That email is already in use.");
  }
}

export async function updateUserAccess(
  actor: Actor,
  userId: string,
  input: { role: UserRole; active: boolean; branches: BranchAccess[] },
) {
  assertCan(actor, "users.manage");
  if (userId === actor.id && !input.active) throw new AppError("You cannot deactivate your own account.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: input.role, active: input.active } });
    await tx.userBranch.deleteMany({ where: { userId } });
    if (input.role !== "OWNER" && input.branches.length) {
      await tx.userBranch.createMany({ data: input.branches.map((branch) => ({ userId, ...branchData(branch) })) });
    }
    if (!input.active) await tx.session.deleteMany({ where: { userId } });
    await audit(tx, {
      userId: actor.id,
      action: "user.update",
      entityType: "user",
      entityId: userId,
      metadata: { role: input.role, active: input.active },
    });
  });
}

function branchData(branch: BranchAccess) {
  return {
    branchId: branch.branchId,
    canReceive: branch.canReceive,
    canCount: branch.canCount,
    canWaste: branch.canWaste,
    canTransferRequest: branch.canTransferRequest,
    canTransferDispatch: branch.canTransferDispatch,
    canTransferReceive: branch.canTransferReceive,
    canRecordUsage: branch.canRecordUsage,
    canRecordSales: branch.canRecordSales,
    canApproveAdjustments: branch.canApproveAdjustments,
  };
}
