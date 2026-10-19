import { businessDayRange, businessRange, todayISO } from "@/domain/dates";
import { D, Decimal } from "@/domain/decimal";
import type { Actor } from "@/domain/permissions";
import { visibleBranchFilter } from "@/server/authz";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getPolicy } from "@/server/settings";

export async function loadDashboard(actor: Actor, filters: { branchId?: string; from?: string; to?: string }) {
  const policy = await getPolicy();
  const today = todayISO(policy.timezone);
  const from = filters.from || today;
  const to = filters.to || today;
  let range: { start: Date; end: Date };
  try {
    range = businessRange(from, to, policy.timezone);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Those dates are not valid.");
  }
  const todayRange = businessDayRange(today, policy.timezone);
  const branchWhere = visibleBranchFilter(actor, filters.branchId);
  const branches = await prisma.branch.findMany({
    where: {
      active: true,
      ...(actor.role === "OWNER" ? {} : { id: { in: actor.branches.map((branch) => branch.branchId) } }),
    },
    orderBy: { code: "asc" },
  });
  const items = await prisma.item.findMany({ include: { baseUnit: true, category: true } });
  const balances = await prisma.inventoryBalance.findMany({ where: branchWhere });
  const configs = await prisma.branchItem.findMany({
    where: actor.role === "OWNER" && !filters.branchId ? {} : { branchId: branchWhere.branchId },
  });
  const costs = await prisma.branchItemCost.findMany({ where: branchWhere });
  const movements = await prisma.stockMovement.findMany({
    where: { ...branchWhere, occurredAt: { gte: range.start, lte: range.end } },
    include: { item: true, user: { select: { id: true, name: true } }, branch: true },
    orderBy: { occurredAt: "desc" },
    take: 12,
  });
  const todayMovements = await prisma.stockMovement.findMany({
    where: { ...branchWhere, occurredAt: { gte: todayRange.start, lte: todayRange.end } },
  });
  const transferWhere = branchScope(branchWhere.branchId);
  const openTransfers = await prisma.stockTransfer.count({
    where: {
      status: { in: ["REQUESTED", "DISPATCHED", "PARTIALLY_RECEIVED"] },
      ...transferWhere,
    },
  });
  const openCounts = await prisma.stockCount.count({
    where: { status: { in: ["DRAFT", "SUBMITTED", "REVIEWED"] }, ...branchIdFilter(branchWhere.branchId) },
  });
  const salesCount = await prisma.sale.count({
    where: { ...branchIdFilter(branchWhere.branchId), soldAt: { gte: range.start, lte: range.end }, status: "POSTED" },
  });
  const finalizedLines = await prisma.stockCountLine.findMany({
    where: {
      count: {
        status: "FINALIZED",
        finalizedAt: { gte: range.start, lte: range.end },
        ...branchIdFilter(branchWhere.branchId),
      },
    },
    include: { item: true, count: { include: { branch: true } } },
  });
  const repeated = repeatedShortages(finalizedLines, policy.repeatedShortageThreshold);
  const expiring = await prisma.itemBatch.findMany({
    where: {
      remainingQty: { gt: 0 },
      expiryDate: { not: null, lte: new Date(Date.now() + policy.expiryWarningDays * 86400000) },
      ...branchIdFilter(branchWhere.branchId),
    },
    include: { item: true, branch: true },
    orderBy: { expiryDate: "asc" },
    take: 8,
  });

  const balanceByKey = new Map(balances.map((row) => [`${row.branchId}:${row.itemId}`, D(row.quantity)]));
  const configByKey = new Map(configs.map((row) => [`${row.branchId}:${row.itemId}`, row]));
  const costByKey = new Map(costs.map((row) => [`${row.branchId}:${row.itemId}`, row]));
  let knownValue = new Decimal(0);
  let incompleteValueItems = 0;
  let low = 0;
  let out = 0;
  const branchCards = branches
    .filter((branch) => !filters.branchId || branch.id === filters.branchId)
    .map((branch) => {
      let branchValue = new Decimal(0);
      let branchIncomplete = 0;
      let branchLow = 0;
      let branchOut = 0;
      let stocked = 0;
      for (const item of items) {
        if (!item.active) continue;
        const qty = balanceByKey.get(`${branch.id}:${item.id}`) ?? new Decimal(0);
        const hasRow = balanceByKey.has(`${branch.id}:${item.id}`);
        const config = configByKey.get(`${branch.id}:${item.id}`);
        const reorder = config ? D(config.reorderPoint) : D(item.defaultReorderPoint);
        if (hasRow) stocked += 1;
        if (hasRow && qty.lte(0)) {
          branchOut += 1;
          out += 1;
        } else if (reorder.gt(0) && qty.gt(0) && qty.lte(reorder)) {
          branchLow += 1;
          low += 1;
        }
        const cost = costByKey.get(`${branch.id}:${item.id}`);
        if (hasRow && qty.gt(0)) {
          if (cost && cost.costComplete && cost.totalValue !== null) {
            branchValue = branchValue.plus(D(cost.totalValue));
            knownValue = knownValue.plus(D(cost.totalValue));
          } else {
            branchIncomplete += 1;
            incompleteValueItems += 1;
          }
        }
      }
      return {
        id: branch.id,
        code: branch.code,
        name: branch.name,
        stocked,
        low: branchLow,
        out: branchOut,
        value: branchValue,
        incomplete: branchIncomplete,
      };
    });

  const countBy = (type: string) => todayMovements.filter((movement) => movement.movementType === type).length;
  const wasteCost = todayMovements
    .filter((movement) => movement.movementType === "WASTE" && movement.valueDelta)
    .reduce((sum, movement) => sum.plus(D(movement.valueDelta!).abs()), new Decimal(0));
  const wasteUnknown = todayMovements.filter((movement) => movement.movementType === "WASTE" && movement.valueDelta === null).length;
  const varianceCostKnown = finalizedLines.filter((line) => line.costKnown && line.varianceCost);
  const varianceCost = varianceCostKnown.reduce((sum, line) => sum.plus(D(line.varianceCost!)), new Decimal(0));
  const varianceUnknown = finalizedLines.filter((line) => !line.costKnown && line.varianceQty && !D(line.varianceQty).isZero()).length;

  const onboarding = {
    branches: branches.length,
    items: items.filter((item) => item.active).length,
    opening: await prisma.stockMovement.count({ where: { movementType: "OPENING" } }),
    recipes: await prisma.recipeRevision.count({ where: { status: "ACTIVE" } }),
    staff: await prisma.user.count({ where: { role: { not: "OWNER" }, active: true } }),
  };

  return {
    policy,
    from,
    to,
    todayLabel: today,
    branches,
    itemCount: items.filter((item) => item.active).length,
    low,
    out,
    knownValue,
    incompleteValueItems,
    activity: {
      receipts: countBy("SUPPLIER_RECEIPT") + countBy("OPENING"),
      usage: countBy("ACTUAL_USAGE") + countBy("SALE_CONSUMPTION"),
      waste: countBy("WASTE"),
      transfers: countBy("TRANSFER_OUT") + countBy("TRANSFER_IN"),
      wasteCost,
      wasteUnknown,
    },
    openTransfers,
    openCounts,
    salesCount,
    salesMissing: salesCount === 0,
    countsMissing: finalizedLines.length === 0,
    varianceCost,
    varianceUnknown,
    negative: balances.filter((row) => D(row.quantity).isNeg()).length,
    repeated,
    expiring,
    recent: movements,
    branchCards,
    pendingTransfers: openTransfers,
    onboarding,
  };
}

function branchIdFilter(branchId: string | { in: string[] } | undefined) {
  if (!branchId) return {};
  return { branchId };
}

function branchScope(branchId: string | { in: string[] } | undefined) {
  if (!branchId) return {};
  if (typeof branchId === "string") {
    return { OR: [{ sourceBranchId: branchId }, { destBranchId: branchId }] };
  }
  return { OR: [{ sourceBranchId: branchId }, { destBranchId: branchId }] };
}

function repeatedShortages(
  lines: Array<{ itemId: string; branchId?: string; varianceQty: { toString(): string } | null; item: { name: string; sku: string }; count: { branchId: string; branch: { code: string; name: string } } }>,
  threshold: number,
) {
  const groups = new Map<string, { itemId: string; sku: string; name: string; branchId: string; branch: string; times: number }>();
  for (const line of lines) {
    if (!line.varianceQty || !D(line.varianceQty).isNeg()) continue;
    const key = `${line.count.branchId}:${line.itemId}`;
    const current = groups.get(key) ?? {
      itemId: line.itemId,
      sku: line.item.sku,
      name: line.item.name,
      branchId: line.count.branchId,
      branch: line.count.branch.code,
      times: 0,
    };
    current.times += 1;
    groups.set(key, current);
  }
  return [...groups.values()].filter((group) => group.times >= threshold);
}

void Decimal;
