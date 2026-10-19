import { toCsv } from "@/domain/csv";
import { businessRange, formatStamp } from "@/domain/dates";
import { D, Decimal } from "@/domain/decimal";
import { formatPhp, formatQty } from "@/domain/format";
import { MOVEMENT_LABELS } from "@/domain/constants";
import type { Actor } from "@/domain/permissions";
import { assertCan, visibleBranchFilter } from "@/server/authz";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getPolicy } from "@/server/settings";
import { replenishmentForBranch } from "@/server/replenishment";

export async function reportCsv(
  actor: Actor,
  slug: string,
  filters: { branchId?: string; from?: string; to?: string },
): Promise<{ filename: string; body: string }> {
  assertCan(actor, "reports.view", filters.branchId);
  const policy = await getPolicy();
  const branchWhere = visibleBranchFilter(actor, filters.branchId);
  const range = filters.from && filters.to ? businessRange(filters.from, filters.to, policy.timezone) : null;
  const occurred = range ? { gte: range.start, lte: range.end } : undefined;

  if (slug === "inventory" || slug === "valuation" || slug === "low-stock") {
    const rows = await inventoryRows(branchWhere.branchId);
    const filtered = slug === "low-stock" ? rows.filter((row) => row.low || row.out) : rows;
    const headers =
      slug === "valuation"
        ? ["Branch", "SKU", "Item", "Quantity", "Unit", "Average cost", "Value", "Valuation"]
        : ["Branch", "SKU", "Item", "Category", "Quantity", "Unit", "Reorder point", "Status"];
    const body = toCsv(
      headers,
      filtered.map((row) =>
        slug === "valuation"
          ? [row.branch, row.sku, row.name, row.quantity, row.unit, row.avgCost, row.value, row.valuation]
          : [row.branch, row.sku, row.name, row.category, row.quantity, row.unit, row.reorder, row.status],
      ),
    );
    return { filename: `${slug}.csv`, body };
  }

  if (slug === "movements" || slug === "adjustments" || slug === "staff") {
    const types = slug === "adjustments" ? { in: ["ADJUSTMENT" as const, "REVERSAL" as const] } : undefined;
    const movements = await prisma.stockMovement.findMany({
      where: { ...branchIdOf(branchWhere.branchId), ...(occurred ? { occurredAt: occurred } : {}), ...(types ? { movementType: types } : {}) },
      include: { item: true, branch: true, user: { select: { name: true, email: true } } },
      orderBy: { occurredAt: "desc" },
      take: 5000,
    });
    const withUnits = await prisma.stockMovement.findMany({
      where: { id: { in: movements.map((movement) => movement.id) } },
      include: { unit: true },
    });
    const unitById = new Map(withUnits.map((movement) => [movement.id, movement.unit.code]));
    const corrected = toCsv(
      ["When", "Branch", "SKU", "Item", "Type", "Quantity change", "Unit", "Recorded by", "Reason", "Reference"],
      movements.map((movement) => [
        formatStamp(movement.occurredAt, policy.timezone),
        movement.branch.code,
        movement.item.sku,
        movement.item.name,
        MOVEMENT_LABELS[movement.movementType] ?? movement.movementType,
        formatQty(D(movement.quantityDelta)),
        unitById.get(movement.id) ?? "",
        movement.user.name,
        movement.reason ?? "",
        movement.referenceType ? `${movement.referenceType} ${movement.referenceId ?? ""}`.trim() : "",
      ]),
    );
    return { filename: `${slug}.csv`, body: corrected };
  }

  if (slug === "waste") {
    const lines = await prisma.wasteLine.findMany({
      where: { waste: { status: "POSTED", ...branchIdOf(branchWhere.branchId), ...(occurred ? { occurredAt: occurred } : {}) } },
      include: { item: { include: { baseUnit: true } }, waste: { include: { branch: true } }, movement: true },
    });
    return {
      filename: "waste.csv",
      body: toCsv(
        ["When", "Branch", "SKU", "Item", "Quantity", "Unit", "Reason", "Cost", "Notes"],
        lines.map((line) => [
          formatStamp(line.waste.occurredAt, policy.timezone),
          line.waste.branch.code,
          line.item.sku,
          line.item.name,
          line.baseQuantity ? formatQty(D(line.baseQuantity)) : "",
          line.item.baseUnit.code,
          line.reason,
          line.movement?.valueDelta ? formatPhp(D(line.movement.valueDelta).abs()) : "Cost unknown",
          line.notes ?? "",
        ]),
      ),
    };
  }

  if (slug === "variances" || slug === "shortages") {
    const lines = await prisma.stockCountLine.findMany({
      where: {
        count: { status: "FINALIZED", ...branchIdOf(branchWhere.branchId), ...(range ? { finalizedAt: { gte: range.start, lte: range.end } } : {}) },
        ...(slug === "shortages" ? { varianceQty: { lt: 0 } } : {}),
      },
      include: { item: { include: { baseUnit: true } }, count: { include: { branch: true, counter: true } } },
    });
    return {
      filename: `${slug}.csv`,
      body: toCsv(
        ["Finalized", "Branch", "SKU", "Item", "Expected", "Counted", "Variance", "Unit", "Cost impact", "Reason", "Counter"],
        lines.map((line) => [
          line.count.finalizedAt ? formatStamp(line.count.finalizedAt, policy.timezone) : "",
          line.count.branch.code,
          line.item.sku,
          line.item.name,
          formatQty(D(line.expectedQty)),
          line.countedQty ? formatQty(D(line.countedQty)) : "",
          line.varianceQty ? formatQty(D(line.varianceQty)) : "",
          line.item.baseUnit.code,
          line.costKnown && line.varianceCost ? formatPhp(D(line.varianceCost)) : "Cost unknown",
          line.reasonCode ?? "",
          line.count.counter.name,
        ]),
      ),
    };
  }

  if (slug === "transfers") {
    const transfers = await prisma.stockTransfer.findMany({
      where: {
        ...(occurred ? { createdAt: occurred } : {}),
        ...(typeof branchWhere.branchId === "string"
          ? { OR: [{ sourceBranchId: branchWhere.branchId }, { destBranchId: branchWhere.branchId }] }
          : branchWhere.branchId
            ? { OR: [{ sourceBranchId: branchWhere.branchId }, { destBranchId: branchWhere.branchId }] }
            : {}),
      },
      include: { source: true, dest: true, lines: { include: { item: true } } },
    });
    const rows = transfers.flatMap((transfer) =>
      transfer.lines.map((line) => [
        transfer.number,
        transfer.status,
        transfer.source.code,
        transfer.dest.code,
        line.item.sku,
        line.item.name,
        formatQty(D(line.requestedQty)),
        formatQty(D(line.dispatchedQty)),
        formatQty(D(line.receivedQty)),
        formatQty(D(line.damagedQty)),
        formatQty(D(line.rejectedQty)),
        formatQty(D(line.lossQty)),
        line.discrepancyReason ?? "",
        line.discrepancyNotes ?? "",
      ]),
    );
    return {
      filename: "transfers.csv",
      body: toCsv(
        ["Transfer", "Status", "From", "To", "SKU", "Item", "Requested", "Dispatched", "Received", "Damaged", "Rejected", "Written off", "Reason", "Notes"],
        rows,
      ),
    };
  }

  if (slug === "purchasing") {
    const receipts = await prisma.goodsReceipt.findMany({
      where: { status: { in: ["POSTED", "REVERSED"] }, ...branchIdOf(branchWhere.branchId), ...(occurred ? { postedAt: occurred } : {}) },
      include: { branch: true, supplier: true, lines: { include: { item: true } } },
    });
    return {
      filename: "purchasing.csv",
      body: toCsv(
        ["Receipt", "Status", "Branch", "Supplier", "Invoice", "SKU", "Item", "Accepted", "Damaged", "Rejected", "Unit cost"],
        receipts.flatMap((receipt) =>
          receipt.lines.map((line) => [
            receipt.number,
            receipt.status,
            receipt.branch.code,
            receipt.supplier?.name ?? "",
            receipt.invoiceRef ?? "",
            line.item.sku,
            line.item.name,
            formatQty(D(line.acceptedQuantity)),
            formatQty(D(line.damagedQuantity)),
            formatQty(D(line.rejectedQuantity)),
            line.unitCost ? formatPhp(D(line.unitCost)) : "Cost unknown",
          ]),
        ),
      ),
    };
  }

  if (slug === "consumption") {
    const movements = await prisma.stockMovement.findMany({
      where: {
        movementType: { in: ["SALE_CONSUMPTION", "ACTUAL_USAGE"] },
        ...branchIdOf(branchWhere.branchId),
        ...(occurred ? { occurredAt: occurred } : {}),
      },
      include: { item: { include: { baseUnit: true } }, branch: true },
    });
    const groups = new Map<string, { branch: string; sku: string; name: string; unit: string; theoretical: Decimal; actual: Decimal }>();
    for (const movement of movements) {
      const key = `${movement.branchId}:${movement.itemId}`;
      const current = groups.get(key) ?? {
        branch: movement.branch.code,
        sku: movement.item.sku,
        name: movement.item.name,
        unit: movement.item.baseUnit.code,
        theoretical: new Decimal(0),
        actual: new Decimal(0),
      };
      const qty = D(movement.quantityDelta).abs();
      if (movement.movementType === "SALE_CONSUMPTION") current.theoretical = current.theoretical.plus(qty);
      if (movement.movementType === "ACTUAL_USAGE") current.actual = current.actual.plus(qty);
      groups.set(key, current);
    }
    return {
      filename: "consumption.csv",
      body: toCsv(
        ["Branch", "SKU", "Item", "Theoretical recipe consumption", "Recorded actual usage", "Unit", "Note"],
        [...groups.values()].map((row) => [
          row.branch,
          row.sku,
          row.name,
          formatQty(row.theoretical),
          formatQty(row.actual),
          row.unit,
          "Theoretical consumption comes only from posted sales and the recipe effective on those sales. Recorded usage is a separate movement and is not subtracted again here.",
        ]),
      ),
    };
  }

  if (slug === "replenishment") {
    const branchIds =
      typeof branchWhere.branchId === "string"
        ? [branchWhere.branchId]
        : branchWhere.branchId
          ? branchWhere.branchId.in
          : (await prisma.branch.findMany({ where: { active: true } })).map((branch) => branch.id);
    const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } } });
    const rows = [];
    for (const branch of branches) {
      const lines = await replenishmentForBranch(branch.id);
      for (const line of lines.filter((entry) => entry.suggested.gt(0))) {
        rows.push([branch.code, line.sku, line.name, formatQty(line.available), formatQty(line.incoming), formatQty(line.target), formatQty(line.suggested), line.unit, line.explanation]);
      }
    }
    return {
      filename: "replenishment.csv",
      body: toCsv(["Branch", "SKU", "Item", "Available", "Eligible incoming", "Target", "Suggested", "Unit", "Calculation"], rows),
    };
  }

  throw new AppError("That report is not available.", "NOT_FOUND", 404);
}

async function inventoryRows(branchId: string | { in: string[] } | undefined) {
  const branches = await prisma.branch.findMany({
    where: { active: true, ...(typeof branchId === "string" ? { id: branchId } : branchId ? { id: branchId } : {}) },
    orderBy: { code: "asc" },
  });
  const items = await prisma.item.findMany({ where: { active: true }, include: { baseUnit: true, category: true } });
  const balances = await prisma.inventoryBalance.findMany({ where: branchIdOf(branchId) });
  const costs = await prisma.branchItemCost.findMany({ where: branchIdOf(branchId) });
  const configs = await prisma.branchItem.findMany({ where: branchIdOf(branchId) });
  const balanceMap = new Map(balances.map((row) => [`${row.branchId}:${row.itemId}`, D(row.quantity)]));
  const costMap = new Map(costs.map((row) => [`${row.branchId}:${row.itemId}`, row]));
  const configMap = new Map(configs.map((row) => [`${row.branchId}:${row.itemId}`, row]));
  return branches.flatMap((branch) =>
    items.flatMap((item) => {
      const key = `${branch.id}:${item.id}`;
      if (!balanceMap.has(key) && slugHasNoBalance()) {
        // Still list items so a branch can see an empty book.
      }
      const qty = balanceMap.get(key) ?? new Decimal(0);
      const has = balanceMap.has(key);
      const config = configMap.get(key);
      const reorder = config ? D(config.reorderPoint) : D(item.defaultReorderPoint);
      const cost = costMap.get(key);
      const out = has && qty.lte(0);
      const low = reorder.gt(0) && qty.gt(0) && qty.lte(reorder);
      return [
        {
          branch: branch.code,
          sku: item.sku,
          name: item.name,
          category: item.category.name,
          quantity: has ? formatQty(qty) : "0",
          unit: item.baseUnit.code,
          reorder: formatQty(reorder),
          status: out ? "Out of stock" : low ? "Low" : has ? "In stock" : "Not stocked",
          avgCost: cost?.costComplete && cost.avgCost ? formatPhp(D(cost.avgCost)) : "Cost unknown",
          value: cost?.costComplete ? formatPhp(D(cost.totalValue)) : "Cost unknown",
          valuation: cost?.costComplete ? "Complete" : "Incomplete",
          low,
          out,
        },
      ];
    }),
  );
}

function slugHasNoBalance() {
  return false;
}

function branchIdOf(branchId: string | { in: string[] } | undefined) {
  if (!branchId) return {};
  return { branchId };
}
