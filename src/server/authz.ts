import { can, canViewBranch, type Permission, type Principal } from "@/domain/permissions";
import { AppError } from "@/server/errors";

export function assertCan(user: Principal, permission: Permission, branchId?: string): void {
  if (!can(user, permission, branchId)) {
    throw new AppError("You do not have permission to do that.", "FORBIDDEN", 403);
  }
}

export function assertBranchVisible(user: Principal, branchId: string): void {
  if (!canViewBranch(user, branchId)) {
    throw new AppError("You do not have access to that branch.", "FORBIDDEN", 403);
  }
}

export function visibleBranchFilter(user: Principal, requested?: string | null): { branchId?: string | { in: string[] } } {
  if (!user.active) {
    throw new AppError("You do not have permission to do that.", "FORBIDDEN", 403);
  }
  if (user.role === "OWNER") {
    return requested ? { branchId: requested } : {};
  }
  const allowed = user.branches.map((branch) => branch.branchId);
  if (requested) {
    if (!allowed.includes(requested)) {
      throw new AppError("You do not have access to that branch.", "FORBIDDEN", 403);
    }
    return { branchId: requested };
  }
  return { branchId: { in: allowed } };
}
