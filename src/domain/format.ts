import { D, Decimal } from "@/domain/decimal";

export function formatQty(value: Decimal | { toString(): string } | string): string {
  const scaled = D(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
  return scaled.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatPhp(value: Decimal | null | undefined): string {
  if (value === null || value === undefined) return "Cost unknown";
  const negative = value.isNeg();
  const [whole, fraction] = value.abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₱${withCommas}.${fraction}`;
}

export function formatSignedQty(value: Decimal | { toString(): string }): string {
  const decimal = D(value);
  const text = formatQty(decimal.abs());
  if (decimal.isZero()) return text;
  return decimal.isNeg() ? `−${text}` : `+${text}`;
}
