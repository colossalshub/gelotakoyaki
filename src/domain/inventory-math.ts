import { D, Decimal, DomainError, roundQty } from "@/domain/decimal";

export function varianceQuantity(actual: Decimal, expected: Decimal): Decimal {
  return roundQty(actual.minus(expected));
}

export function varianceValue(
  variance: Decimal,
  avgCost: Decimal | null,
  costComplete: boolean,
): { cost: Decimal | null; known: boolean } {
  if (!costComplete || avgCost === null) return { cost: null, known: false };
  return { cost: roundQty(variance.mul(avgCost)), known: true };
}

/**
 * Suggested replenishment = max(0, target − available − eligible incoming).
 * Eligible incoming is stock already dispatched toward this branch and not yet received.
 * Unapproved requests and unordered or unconfirmed supplier deliveries are excluded.
 */
export function suggestedReplenishment(
  target: Decimal,
  available: Decimal,
  eligibleIncoming: Decimal,
): Decimal {
  const raw = target.minus(available).minus(eligibleIncoming);
  return roundQty(Decimal.max(new Decimal(0), raw));
}

export function replenishmentExplanation(
  target: Decimal,
  available: Decimal,
  eligibleIncoming: Decimal,
  result: Decimal,
): string {
  return `target ${target.toFixed()} − available ${available.toFixed()} − incoming ${eligibleIncoming.toFixed()} = ${result.toFixed()}`;
}

/**
 * Gross theoretical consumption.
 * Yield is the usable fraction (1 means no extra loss). Gross = sold × recipe quantity ÷ yield.
 * This is an estimate from the configured recipe. It is not recorded waste.
 */
export function theoreticalConsumption(
  soldQty: Decimal,
  quantityPerUnit: Decimal,
  yieldFactor: Decimal,
): Decimal {
  if (soldQty.isNeg()) throw new DomainError("Sold quantity cannot be negative.");
  if (quantityPerUnit.isNeg()) throw new DomainError("Recipe quantity cannot be negative.");
  if (yieldFactor.lte(0)) throw new DomainError("Yield factor must be greater than zero.");
  return roundQty(soldQty.mul(quantityPerUnit).div(yieldFactor));
}

export type CostState = {
  onHandQty: Decimal;
  totalValue: Decimal;
  avgCost: Decimal | null;
  lastCost: Decimal | null;
  costComplete: boolean;
};

export function emptyCostState(): CostState {
  return {
    onHandQty: new Decimal(0),
    totalValue: new Decimal(0),
    avgCost: null,
    lastCost: null,
    costComplete: true,
  };
}

export type CostChange = {
  valueDelta: Decimal | null;
  next: CostState;
};

/**
 * Weighted-average valuation.
 * Inbound quantity with a unit cost updates the average.
 * Inbound quantity without a unit cost marks valuation incomplete and does not invent a cost.
 * Outbound quantity removes value at the current average when valuation is complete.
 * A reversal applies the opposite of the original value change.
 */
export function applyCostChange(input: {
  prev: CostState;
  quantityDelta: Decimal;
  unitCost: Decimal | null;
  reversal: boolean;
  originalValueDelta: Decimal | null;
  originalValueKnown: boolean;
}): CostChange {
  const prev = input.prev;
  const delta = input.quantityDelta;
  let valueDelta: Decimal | null = null;
  let complete = prev.costComplete;
  let last = prev.lastCost;

  if (input.reversal) {
    if (!input.originalValueKnown || input.originalValueDelta === null) {
      valueDelta = null;
      complete = false;
    } else {
      valueDelta = roundQty(input.originalValueDelta.neg());
    }
  } else if (delta.gt(0)) {
    if (input.unitCost) {
      valueDelta = roundQty(delta.mul(input.unitCost));
      last = roundQty(input.unitCost);
    } else {
      valueDelta = new Decimal(0);
      complete = false;
    }
  } else if (complete && prev.avgCost) {
    valueDelta = roundQty(delta.mul(prev.avgCost));
  } else {
    valueDelta = null;
    complete = false;
  }

  const newQty = roundQty(prev.onHandQty.plus(delta));
  let newValue = roundQty(prev.totalValue.plus(valueDelta ?? 0));
  let avg: Decimal | null = null;

  if (newQty.isZero()) {
    newValue = new Decimal(0);
    avg = complete ? last : null;
  } else if (complete && newQty.gt(0)) {
    avg = roundQty(newValue.div(newQty));
  } else if (complete && newQty.isNeg() && prev.avgCost) {
    avg = prev.avgCost;
    newValue = roundQty(newQty.mul(avg));
  } else {
    avg = null;
  }

  return {
    valueDelta,
    next: {
      onHandQty: newQty,
      totalValue: newValue,
      avgCost: avg,
      lastCost: last,
      costComplete: complete,
    },
  };
}

export function balancesMatch(ledgerSum: Decimal, cached: Decimal): boolean {
  return roundQty(ledgerSum).eq(roundQty(cached));
}

export function DCost(value: { toString(): string } | null | undefined): Decimal | null {
  if (value === null || value === undefined) return null;
  return D(value);
}
