import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "test") {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("gelos_test")) {
    throw new Error("Refusing to run tests against a non-test database.");
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
