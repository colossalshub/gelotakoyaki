import { D, Decimal } from "@/domain/decimal";
import { replenishmentExplanation, suggestedReplenishment } from "@/domain/inventory-math";
import { eligibleIncoming } from "@/server/transfers";
import { prisma } from "@/server/db";

export async function replenishmentForBranch(branchId: string) {
  const [items, balances, configs] = await Promise.all([
    prisma.item.findMany({ where: { active: true }, include: { baseUnit: true } }),
    prisma.inventoryBalance.findMany({ where: { branchId } }),
    prisma.branchItem.findMany({ where: { branchId } }),
  ]);
  const balanceMap = new Map(balances.map((row) => [row.itemId, D(row.quantity)]));
  const configMap = new Map(configs.map((row) => [row.itemId, row]));
  const lines = [];
  for (const item of items) {
    const config = configMap.get(item.id);
    const target = config ? D(config.targetLevel) : D(item.defaultTargetLevel);
    const reorder = config ? D(config.reorderPoint) : D(item.defaultReorderPoint);
    if (target.lte(0) && reorder.lte(0)) continue;
    const available = balanceMap.get(item.id) ?? new Decimal(0);
    const incoming = await eligibleIncoming(branchId, item.id);
    const suggested = suggestedReplenishment(target, available, incoming);
    if (suggested.lte(0) && (reorder.lte(0) || available.gt(reorder))) continue;
    lines.push({
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.baseUnit.code,
      available,
      incoming,
      reorder,
      target,
      suggested,
      explanation: replenishmentExplanation(target, available, incoming, suggested),
      low: reorder.gt(0) && available.lte(reorder),
      out: available.lte(0),
    });
  }
  return lines.sort((a, b) => b.suggested.cmp(a.suggested));
}
