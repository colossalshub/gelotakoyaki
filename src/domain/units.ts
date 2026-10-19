import { D, Decimal, DomainError, roundQty } from "@/domain/decimal";

export type UnitRef = {
  id: string;
  code: string;
  dimension: string;
  toDimensionBase: Decimal;
};

/**
 * Convert a quantity into an item's base unit.
 * Same-dimension units use their configured factors only.
 * A purchase unit in a different dimension uses the item's explicit factor.
 * Mass and volume are never treated as interchangeable.
 */
export function convertToBase(input: {
  quantity: Decimal;
  fromUnit: UnitRef;
  baseUnit: UnitRef;
  purchaseUnitId: string;
  purchaseToBaseFactor: Decimal;
}): Decimal {
  const { quantity, fromUnit, baseUnit, purchaseUnitId, purchaseToBaseFactor } = input;
  if (quantity.isNeg()) {
    throw new DomainError("Quantity cannot be negative.");
  }
  if (fromUnit.id === baseUnit.id) return roundQty(quantity);

  const sameFamily =
    fromUnit.dimension === baseUnit.dimension && fromUnit.dimension !== "custom";
  if (sameFamily) {
    if (fromUnit.toDimensionBase.lte(0) || baseUnit.toDimensionBase.lte(0)) {
      throw new DomainError("Unit conversion factors must be greater than zero.");
    }
    return roundQty(quantity.mul(fromUnit.toDimensionBase).div(baseUnit.toDimensionBase));
  }

  if (fromUnit.id === purchaseUnitId) {
    if (purchaseToBaseFactor.lte(0)) {
      throw new DomainError(
        "This purchase unit needs an explicit conversion factor. Density is not assumed.",
      );
    }
    return roundQty(quantity.mul(purchaseToBaseFactor));
  }

  throw new DomainError(
    `Cannot convert ${fromUnit.code} to ${baseUnit.code}. Add a conversion, or enter the quantity in ${baseUnit.code}. One litre is not assumed to equal one kilogram.`,
  );
}

export function dimensionalFactor(from: UnitRef, base: UnitRef): Decimal | null {
  if (from.dimension !== base.dimension || from.dimension === "custom") return null;
  if (from.toDimensionBase.lte(0) || base.toDimensionBase.lte(0)) return null;
  return roundQty(from.toDimensionBase.div(base.toDimensionBase));
}

export function unitFromRow(row: {
  id: string;
  code: string;
  dimension: string;
  toDimensionBase: { toString(): string };
}): UnitRef {
  return {
    id: row.id,
    code: row.code,
    dimension: row.dimension,
    toDimensionBase: D(row.toDimensionBase),
  };
}
