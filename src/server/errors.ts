import { Prisma } from "@prisma/client";
import { DomainError } from "@/domain/decimal";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "BAD_REQUEST", status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof AppError || error instanceof DomainError) return error.message;
  console.error(error);
  return "Something went wrong. Nothing was posted.";
}

export function rethrowNavigation(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
  ) {
    throw error;
  }
}
