export type Role = "OWNER" | "BRANCH_MANAGER" | "STAFF";

export type BranchAccess = {
  branchId: string;
  canReceive: boolean;
  canCount: boolean;
  canWaste: boolean;
  canTransferRequest: boolean;
  canTransferDispatch: boolean;
  canTransferReceive: boolean;
  canRecordUsage: boolean;
  canRecordSales: boolean;
  canApproveAdjustments: boolean;
};

export type Principal = {
  id: string;
  role: Role;
  active: boolean;
  branches: BranchAccess[];
};

export type Actor = Principal & {
  email: string;
  name: string;
  mustChangePassword: boolean;
};

export type Permission =
  | "settings.manage"
  | "users.manage"
  | "branches.manage"
  | "catalog.manage"
  | "recipes.manage"
  | "recipes.view"
  | "audit.view"
  | "reports.view"
  | "inventory.view"
  | "inventory.receive"
  | "inventory.opening"
  | "inventory.usage"
  | "inventory.waste"
  | "inventory.reverse"
  | "inventory.transfer.request"
  | "inventory.transfer.dispatch"
  | "inventory.transfer.receive"
  | "inventory.transfer.resolve"
  | "inventory.count.submit"
  | "inventory.count.review"
  | "inventory.count.finalize"
  | "inventory.configure"
  | "sales.manage"
  | "po.manage";

const OWNER_ONLY: Permission[] = [
  "settings.manage",
  "users.manage",
  "branches.manage",
  "catalog.manage",
  "recipes.manage",
  "audit.view",
];

export function can(user: Principal, permission: Permission, branchId?: string): boolean {
  if (!user.active) return false;
  if (user.role === "OWNER") return true;
  if (OWNER_ONLY.includes(permission)) return false;
  if (permission === "recipes.view") return true;

  if (permission === "reports.view" || permission === "inventory.configure") {
    if (user.role !== "BRANCH_MANAGER") return false;
    if (!branchId) return user.branches.length > 0;
    return user.branches.some((branch) => branch.branchId === branchId);
  }

  if (!branchId) return false;
  const flags = user.branches.find((branch) => branch.branchId === branchId);
  if (!flags) return false;

  if (user.role === "BRANCH_MANAGER") {
    switch (permission) {
      case "inventory.view":
      case "inventory.receive":
      case "inventory.opening":
      case "inventory.usage":
      case "inventory.waste":
      case "inventory.reverse":
      case "inventory.transfer.request":
      case "inventory.transfer.dispatch":
      case "inventory.transfer.receive":
      case "inventory.count.submit":
      case "inventory.count.review":
      case "sales.manage":
      case "po.manage":
        return true;
      case "inventory.count.finalize":
      case "inventory.transfer.resolve":
        return flags.canApproveAdjustments;
      default:
        return false;
    }
  }

  switch (permission) {
    case "inventory.view":
      return true;
    case "inventory.receive":
    case "po.manage":
      return flags.canReceive;
    case "inventory.usage":
      return flags.canRecordUsage;
    case "inventory.waste":
      return flags.canWaste;
    case "inventory.transfer.request":
      return flags.canTransferRequest;
    case "inventory.transfer.dispatch":
      return flags.canTransferDispatch;
    case "inventory.transfer.receive":
      return flags.canTransferReceive;
    case "inventory.count.submit":
      return flags.canCount;
    case "sales.manage":
      return flags.canRecordSales;
    default:
      return false;
  }
}

export function canViewBranch(user: Principal, branchId: string): boolean {
  if (!user.active) return false;
  if (user.role === "OWNER") return true;
  return user.branches.some((branch) => branch.branchId === branchId);
}
