import { Decimal, DomainError } from "@/domain/decimal";

export function parseQty(raw: string, options: { allowZero?: boolean } = {}): Decimal {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new DomainError("Enter a quantity with up to 6 decimal places and no symbols.");
  }
  const parsed = new Decimal(value);
  if (parsed.gt("1000000000")) throw new DomainError("That quantity is too large.");
  if (options.allowZero) {
    if (parsed.isNeg()) throw new DomainError("Quantity cannot be negative.");
  } else if (parsed.lte(0)) {
    throw new DomainError("Enter a quantity greater than zero.");
  }
  return parsed;
}

export function parseOptionalQty(raw: string | undefined | null): Decimal {
  if (!raw || raw.trim() === "") return new Decimal(0);
  return parseQty(raw, { allowZero: true });
}

export function parseOptionalCost(raw: string | undefined | null): Decimal | null {
  if (!raw || raw.trim() === "") return null;
  const value = raw.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new DomainError("Enter a unit cost with up to 4 decimal places, or leave it blank.");
  }
  const parsed = new Decimal(value);
  if (parsed.gt("1000000000")) throw new DomainError("That cost is too large.");
  return parsed;
}
