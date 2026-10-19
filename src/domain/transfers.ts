import { D, Decimal, roundQty } from "@/domain/decimal";

export function inTransitQuantity(line: {
  dispatchedQty: { toString(): string };
  receivedQty: { toString(): string };
  damagedQty: { toString(): string };
  rejectedQty: { toString(): string };
  lossQty: { toString(): string };
}): Decimal {
  return roundQty(
    D(line.dispatchedQty)
      .minus(D(line.receivedQty))
      .minus(D(line.damagedQty))
      .minus(D(line.rejectedQty))
      .minus(D(line.lossQty)),
  );
}
