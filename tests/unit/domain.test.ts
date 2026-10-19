import { describe, expect, it } from "vitest";
import { toCsv, parseCsv, sanitizeCsvCell } from "@/domain/csv";
import { businessDayRange } from "@/domain/dates";
import { Decimal } from "@/domain/decimal";
import { formatPhp, formatQty } from "@/domain/format";
import {
  applyCostChange,
  emptyCostState,
  replenishmentExplanation,
  suggestedReplenishment,
  theoreticalConsumption,
  varianceQuantity,
  varianceValue,
} from "@/domain/inventory-math";
import { passwordError } from "@/domain/password";
import { can, type BranchAccess, type Principal } from "@/domain/permissions";
import { inTransitQuantity } from "@/domain/transfers";
import { convertToBase, type UnitRef } from "@/domain/units";

const gram: UnitRef = { id: "g", code: "g", dimension: "mass", toDimensionBase: new Decimal(1) };
const kilogram: UnitRef = { id: "kg", code: "kg", dimension: "mass", toDimensionBase: new Decimal(1000) };
const litre: UnitRef = { id: "L", code: "L", dimension: "volume", toDimensionBase: new Decimal(1000) };
const piece: UnitRef = { id: "pc", code: "pc", dimension: "count", toDimensionBase: new Decimal(1) };
const sack: UnitRef = { id: "sack", code: "sack", dimension: "custom", toDimensionBase: new Decimal(1) };

const flags = (branchId: string, extra: Partial<BranchAccess> = {}): BranchAccess => ({
  branchId,
  canReceive: false,
  canCount: false,
  canWaste: true,
  canTransferRequest: true,
  canTransferDispatch: false,
  canTransferReceive: false,
  canRecordUsage: true,
  canRecordSales: false,
  canApproveAdjustments: false,
  ...extra,
});

function user(role: Principal["role"], branches: BranchAccess[] = []): Principal {
  return { id: "u", role, active: true, branches };
}

describe("unit conversion", () => {
  it("converts kilograms to grams once", () => {
    const result = convertToBase({
      quantity: new Decimal(2),
      fromUnit: kilogram,
      baseUnit: gram,
      purchaseUnitId: kilogram.id,
      purchaseToBaseFactor: new Decimal(1000),
    });
    expect(result.eq(2000)).toBe(true);
    expect(result.toFixed()).toBe("2000");
  });

  it("does not treat litres as kilograms", () => {
    expect(() =>
      convertToBase({
        quantity: new Decimal(1),
        fromUnit: litre,
        baseUnit: gram,
        purchaseUnitId: kilogram.id,
        purchaseToBaseFactor: new Decimal(1000),
      }),
    ).toThrow(/not assumed/i);
  });

  it("uses an explicit factor for a custom purchase unit", () => {
    const result = convertToBase({
      quantity: new Decimal(2),
      fromUnit: sack,
      baseUnit: piece,
      purchaseUnitId: sack.id,
      purchaseToBaseFactor: new Decimal(50),
    });
    expect(result.eq(100)).toBe(true);
  });
});

describe("inventory math", () => {
  it("adds decimal quantities without binary floating point drift", () => {
    const total = new Decimal("0.1").plus("0.2");
    expect(total.eq("0.3")).toBe(true);
  });

  it("calculates a negative count variance", () => {
    expect(varianceQuantity(new Decimal(110), new Decimal(115)).eq(-5)).toBe(true);
    expect(varianceQuantity(new Decimal(43), new Decimal(50)).eq(-7)).toBe(true);
  });

  it("does not invent a variance cost", () => {
    expect(varianceValue(new Decimal(-7), null, false)).toEqual({ cost: null, known: false });
    expect(varianceValue(new Decimal(-7), new Decimal(10), false).known).toBe(false);
    expect(varianceValue(new Decimal(-7), new Decimal("2.5"), true).cost?.eq("-17.5")).toBe(true);
  });

  it("calculates theoretical recipe consumption", () => {
    expect(theoreticalConsumption(new Decimal(20), new Decimal(15), new Decimal(1)).eq(300)).toBe(true);
    expect(theoreticalConsumption(new Decimal(10), new Decimal(8), new Decimal("0.8")).eq(100)).toBe(true);
  });

  it("explains replenishment and ignores nothing already subtracted by the caller", () => {
    const result = suggestedReplenishment(new Decimal(100), new Decimal(40), new Decimal(10));
    expect(result.eq(50)).toBe(true);
    expect(replenishmentExplanation(new Decimal(100), new Decimal(40), new Decimal(10), result)).toContain("= 50");
    expect(suggestedReplenishment(new Decimal(10), new Decimal(30), new Decimal(0)).eq(0)).toBe(true);
  });

  it("keeps a weighted average exact", () => {
    let state = emptyCostState();
    state = applyCostChange({
      prev: state,
      quantityDelta: new Decimal(10),
      unitCost: new Decimal(100),
      reversal: false,
      originalValueDelta: null,
      originalValueKnown: false,
    }).next;
    state = applyCostChange({
      prev: state,
      quantityDelta: new Decimal(10),
      unitCost: new Decimal(200),
      reversal: false,
      originalValueDelta: null,
      originalValueKnown: false,
    }).next;
    expect(state.avgCost?.eq(150)).toBe(true);
    expect(state.totalValue.eq(3000)).toBe(true);
    const used = applyCostChange({
      prev: state,
      quantityDelta: new Decimal(-5),
      unitCost: null,
      reversal: false,
      originalValueDelta: null,
      originalValueKnown: false,
    });
    expect(used.valueDelta?.eq(-750)).toBe(true);
    expect(used.next.totalValue.eq(2250)).toBe(true);
    expect(used.next.avgCost?.eq(150)).toBe(true);
  });

  it("marks valuation incomplete when an inbound cost is missing", () => {
    const next = applyCostChange({
      prev: emptyCostState(),
      quantityDelta: new Decimal(4),
      unitCost: null,
      reversal: false,
      originalValueDelta: null,
      originalValueKnown: false,
    }).next;
    expect(next.costComplete).toBe(false);
    expect(next.avgCost).toBeNull();
  });
});

describe("transfers and permissions", () => {
  it("keeps unresolved transfer quantity out of both available balances", () => {
    const remaining = inTransitQuantity({
      dispatchedQty: "20",
      receivedQty: "18",
      damagedQty: "0",
      rejectedQty: "0",
      lossQty: "0",
    });
    expect(remaining.eq(2)).toBe(true);
  });

  it("lets the owner see every branch and stops a staff member at the server rules", () => {
    const owner = user("OWNER");
    const staff = user("STAFF", [flags("A", { canWaste: true, canCount: true })]);
    expect(can(owner, "inventory.view", "B")).toBe(true);
    expect(can(staff, "inventory.view", "A")).toBe(true);
    expect(can(staff, "inventory.waste", "A")).toBe(true);
    expect(can(staff, "inventory.view", "B")).toBe(false);
    expect(can(staff, "inventory.waste", "B")).toBe(false);
    expect(can(staff, "inventory.receive", "A")).toBe(false);
    expect(can(staff, "inventory.count.finalize", "A")).toBe(false);
    expect(can(staff, "reports.view", "A")).toBe(false);
    expect(can(staff, "users.manage")).toBe(false);
  });

  it("lets a manager approve only when that permission is granted", () => {
    const manager = user("BRANCH_MANAGER", [flags("A")]);
    const approver = user("BRANCH_MANAGER", [flags("A", { canApproveAdjustments: true })]);
    expect(can(manager, "inventory.count.review", "A")).toBe(true);
    expect(can(manager, "inventory.count.finalize", "A")).toBe(false);
    expect(can(approver, "inventory.count.finalize", "A")).toBe(true);
    expect(can(approver, "inventory.transfer.resolve", "B")).toBe(false);
    expect(can({ ...manager, active: false }, "inventory.view", "A")).toBe(false);
  });
});

describe("csv, dates, and passwords", () => {
  it("neutralises spreadsheet formulas and round-trips quotes", () => {
    expect(sanitizeCsvCell("=cmd()")).toBe("'=cmd()");
    expect(sanitizeCsvCell("+1")).toBe("'+1");
    const csv = toCsv(["name", "note"], [["Octopus", "=1+1"], ["A,B", 'say "hi"']]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const rows = parseCsv(csv);
    expect(rows[1][0]).toBe("Octopus");
    expect(rows[1][1]).toBe("'=1+1");
    expect(rows[2][0]).toBe("A,B");
    expect(rows[2][1]).toBe('say "hi"');
  });

  it("treats a Manila business day as UTC bounds", () => {
    const range = businessDayRange("2026-01-15", "Asia/Manila");
    expect(range.start.toISOString()).toBe("2026-01-14T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-01-15T15:59:59.999Z");
  });

  it("rejects a short or common password and formats peso amounts from decimals", () => {
    expect(passwordError("short")).toMatch(/12/);
    expect(passwordError("password1234")).toMatch(/common/);
    expect(passwordError("correct horse battery")).toBeNull();
    expect(formatPhp(new Decimal("1234.5"))).toBe("₱1,234.50");
    expect(formatPhp(null)).toBe("Cost unknown");
    expect(formatQty(new Decimal("2000.000"))).toBe("2000");
  });
});
