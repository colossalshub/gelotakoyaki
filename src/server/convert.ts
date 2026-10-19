import type { Item, Unit } from "@prisma/client";
import { D, Decimal, roundQty } from "@/domain/decimal";
import { convertToBase, unitFromRow, type UnitRef } from "@/domain/units";
import type { Tx } from "@/server/db";
import { AppError } from "@/server/errors";

export type ItemWithUnits = Item & { baseUnit: Unit; purchaseUnit: Unit };

export async function loadUnitMap(tx: Tx): Promise<Map<string, UnitRef>> {
  const units = await tx.unit.findMany();
  return new Map(units.map((unit) => [unit.id, unitFromRow(unit)]));
}

export async function requireItem(tx: Tx, itemId: string, allowInactive = false): Promise<ItemWithUnits> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    include: { baseUnit: true, purchaseUnit: true },
  });
  if (!item) throw new AppError("That item was not found.", "NOT_FOUND", 404);
  if (!item.active && !allowInactive) {
    throw new AppError(`${item.name} is archived. Restore it before using it here.`, "ARCHIVED");
  }
  return item;
}

export function convertItemQuantity(
  item: ItemWithUnits,
  units: Map<string, UnitRef>,
  unitId: string,
  quantity: Decimal,
): Decimal {
  const from = units.get(unitId);
  if (!from) throw new AppError("That unit was not found.", "NOT_FOUND", 404);
  return convertToBase({
    quantity,
    fromUnit: from,
    baseUnit: unitFromRow(item.baseUnit),
    purchaseUnitId: item.purchaseUnitId,
    purchaseToBaseFactor: D(item.purchaseToBaseFactor),
  });
}

export function costPerBase(enteredQty: Decimal, baseQty: Decimal, enteredUnitCost: Decimal | null): Decimal | null {
  if (!enteredUnitCost || baseQty.lte(0)) return null;
  return roundQty(enteredQty.mul(enteredUnitCost).div(baseQty));
}
