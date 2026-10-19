import type { Actor } from "@/domain/permissions";
import { prisma } from "@/server/db";

export async function visibleBranches(actor: Actor) {
  return prisma.branch.findMany({
    where:
      actor.role === "OWNER"
        ? { active: true }
        : { active: true, id: { in: actor.branches.map((branch) => branch.branchId) } },
    orderBy: { code: "asc" },
  });
}

export async function activeItems() {
  return prisma.item.findMany({
    where: { active: true },
    include: { baseUnit: true, purchaseUnit: true, category: true },
    orderBy: { name: "asc" },
  });
}

export async function activeUnits() {
  return prisma.unit.findMany({ where: { active: true }, orderBy: { code: "asc" } });
}

export function toClientItem(
  item: Awaited<ReturnType<typeof activeItems>>[number],
) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    baseUnitId: item.baseUnitId,
    baseUnitCode: item.baseUnit.code,
    purchaseUnitId: item.purchaseUnitId,
    purchaseUnitCode: item.purchaseUnit.code,
    tracksBatch: item.tracksBatch,
    tracksExpiry: item.tracksExpiry,
  };
}
