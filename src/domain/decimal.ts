import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function D(value: Decimal | { toString(): string } | string | number): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
}

export function roundQty(value: Decimal): Decimal {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

export function decToDb(value: Decimal, scale = 6): string {
  return value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code = "INVALID") {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
