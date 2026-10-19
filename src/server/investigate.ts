import { D } from "@/domain/decimal";
import type { Actor } from "@/domain/permissions";
import { assertBranchVisible } from "@/server/authz";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

export async function investigateItem(actor: Actor, input: { branchId: string; itemId: string; countLineId?: string }) {
  assertBranchVisible(actor, input.branchId);
  const item = await prisma.item.findUnique({
    where: { id: input.itemId },
    include: { baseUnit: true, category: true },
  });
  if (!item) throw new AppError("That item was not found.", "NOT_FOUND", 404);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new AppError("That branch was not found.", "NOT_FOUND", 404);

  const countLines = await prisma.stockCountLine.findMany({
    where: { itemId: item.id, count: { branchId: branch.id, status: "FINALIZED" } },
    include: { count: true },
    orderBy: { snapshotAt: "desc" },
    take: 8,
  });
  const focus = input.countLineId
    ? await prisma.stockCountLine.findUnique({ where: { id: input.countLineId }, include: { count: true } })
    : countLines[0] ?? null;
  if (focus && focus.count.branchId !== branch.id) {
    throw new AppError("You do not have access to that branch.", "FORBIDDEN", 403);
  }
  const windowEnd = focus?.snapshotAt ?? new Date();
  const previous = countLines.find((line) => line.snapshotAt < windowEnd);
  const windowStart = previous?.snapshotAt ?? new Date(windowEnd.getTime() - 30 * 86400000);

  const movements = await prisma.stockMovement.findMany({
    where: { branchId: branch.id, itemId: item.id, occurredAt: { gt: windowStart, lte: windowEnd } },
    include: { user: { select: { name: true } } },
    orderBy: { occurredAt: "asc" },
  });
  const after = focus
    ? await prisma.stockMovement.findMany({
        where: { branchId: branch.id, itemId: item.id, createdAt: { gt: focus.snapshotAt } },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 20,
      })
    : [];
  const sales = await prisma.sale.findMany({
    where: { branchId: branch.id, soldAt: { gt: windowStart, lte: windowEnd }, status: "POSTED" },
    include: { menuItem: true },
    orderBy: { soldAt: "desc" },
    take: 30,
  });
  const balance = await prisma.inventoryBalance.findUnique({
    where: { branchId_itemId: { branchId: branch.id, itemId: item.id } },
  });
  const cost = await prisma.branchItemCost.findUnique({
    where: { branchId_itemId: { branchId: branch.id, itemId: item.id } },
  });

  return {
    item,
    branch,
    focus,
    history: countLines,
    movements,
    afterSnapshot: after,
    sales,
    balance: balance ? D(balance.quantity) : D(0),
    cost,
    windowStart,
    windowEnd,
    theoretical: movements.filter((movement) => movement.movementType === "SALE_CONSUMPTION"),
    actual: movements.filter((movement) => movement.movementType === "ACTUAL_USAGE"),
    waste: movements.filter((movement) => movement.movementType === "WASTE"),
    receipts: movements.filter((movement) => movement.movementType === "SUPPLIER_RECEIPT" || movement.movementType === "OPENING"),
    transfers: movements.filter((movement) => movement.movementType === "TRANSFER_IN" || movement.movementType === "TRANSFER_OUT"),
    adjustments: movements.filter((movement) => movement.movementType === "ADJUSTMENT" || movement.movementType === "REVERSAL"),
  };
}
