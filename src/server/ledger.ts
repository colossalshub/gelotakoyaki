import { Prisma, type MovementType, type StockMovement } from "@prisma/client";
import {
  applyCostChange,
  balancesMatch,
  emptyCostState,
  type CostState,
} from "@/domain/inventory-math";
import { D, decToDb, Decimal } from "@/domain/decimal";
import { audit } from "@/server/audit";
import { prisma, type Tx } from "@/server/db";
import { AppError, isUniqueViolation } from "@/server/errors";
import { getPolicy } from "@/server/settings";

export type PostMovementInput = {
  branchId: string;
  itemId: string;
  quantityDelta: Decimal;
  unitId: string;
  enteredQuantity?: Decimal | null;
  enteredUnitId?: string | null;
  movementType: MovementType;
  occurredAt?: Date;
  userId: string;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  notes?: string | null;
  sourceRef?: string | null;
  idempotencyKey?: string | null;
  reversalOfId?: string | null;
  batchId?: string | null;
  unitCost?: Decimal | null;
  originalValueDelta?: Decimal | null;
  originalValueKnown?: boolean;
};

export type PostMovementResult = {
  movement: StockMovement;
  created: boolean;
};

async function lockBalance(tx: Tx, branchId: string, itemId: string): Promise<Decimal> {
  await tx.$executeRaw`
    INSERT INTO inventory_balances (branch_id, item_id, quantity, updated_at)
    VALUES (CAST(${branchId} AS uuid), CAST(${itemId} AS uuid), 0, NOW())
    ON CONFLICT (branch_id, item_id) DO NOTHING
  `;
  const rows = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
    SELECT quantity FROM inventory_balances
    WHERE branch_id = CAST(${branchId} AS uuid)
      AND item_id = CAST(${itemId} AS uuid)
    FOR UPDATE
  `;
  if (!rows[0]) throw new AppError("Could not lock the inventory balance.", "LOCK_FAILED", 500);
  return D(rows[0].quantity);
}

async function lockCost(tx: Tx, branchId: string, itemId: string): Promise<CostState> {
  await tx.branchItemCost.upsert({
    where: { branchId_itemId: { branchId, itemId } },
    create: {
      branchId,
      itemId,
      onHandQty: 0,
      totalValue: 0,
      costComplete: true,
    },
    update: {},
  });
  const rows = await tx.$queryRaw<
    Array<{
      on_hand_qty: Prisma.Decimal;
      total_value: Prisma.Decimal;
      avg_cost: Prisma.Decimal | null;
      last_cost: Prisma.Decimal | null;
      cost_complete: boolean;
    }>
  >`
    SELECT on_hand_qty, total_value, avg_cost, last_cost, cost_complete
    FROM branch_item_costs
    WHERE branch_id = CAST(${branchId} AS uuid)
      AND item_id = CAST(${itemId} AS uuid)
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new AppError("Could not lock the item cost.", "LOCK_FAILED", 500);
  return {
    onHandQty: D(row.on_hand_qty),
    totalValue: D(row.total_value),
    avgCost: row.avg_cost === null ? null : D(row.avg_cost),
    lastCost: row.last_cost === null ? null : D(row.last_cost),
    costComplete: row.cost_complete,
  };
}

async function applyBatchDelta(tx: Tx, batchId: string, itemId: string, branchId: string, delta: Decimal) {
  const rows = await tx.$queryRaw<Array<{ remaining_qty: Prisma.Decimal; item_id: string; branch_id: string }>>`
    SELECT remaining_qty, item_id, branch_id
    FROM item_batches
    WHERE id = CAST(${batchId} AS uuid)
    FOR UPDATE
  `;
  const batch = rows[0];
  if (!batch || batch.item_id !== itemId || batch.branch_id !== branchId) {
    throw new AppError("That batch does not belong to this item and branch.", "BATCH");
  }
  const next = D(batch.remaining_qty).plus(delta);
  if (next.isNeg()) {
    throw new AppError("That batch does not have enough remaining quantity.", "BATCH");
  }
  await tx.itemBatch.update({
    where: { id: batchId },
    data: { remainingQty: decToDb(next) },
  });
}

export async function postMovement(input: PostMovementInput, tx?: Tx): Promise<PostMovementResult> {
  if (tx) return insertMovement(tx, input);
  try {
    return await prisma.$transaction((inner) => insertMovement(inner, input));
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await prisma.stockMovement.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return { movement: existing, created: false };
    }
    throw error;
  }
}

async function insertMovement(tx: Tx, input: PostMovementInput): Promise<PostMovementResult> {
  if (input.quantityDelta.isZero()) {
    throw new AppError("A stock movement needs a quantity other than zero.", "ZERO_QTY");
  }
  if (input.idempotencyKey) {
    const existing = await tx.stockMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { movement: existing, created: false };
  }

  const current = await lockBalance(tx, input.branchId, input.itemId);
  const nextQty = current.plus(input.quantityDelta);
  const policy = await getPolicy(tx);
  if (policy.preventNegativeStock && nextQty.isNeg()) {
    throw new AppError(
      `Not enough stock. Available ${current.toFixed()}, and this change is ${input.quantityDelta.toFixed()}.`,
      "NEGATIVE_STOCK",
    );
  }

  const prevCost = await lockCost(tx, input.branchId, input.itemId);
  const cost = applyCostChange({
    prev: prevCost.onHandQty.eq(current) ? prevCost : { ...prevCost, onHandQty: current },
    quantityDelta: input.quantityDelta,
    unitCost: input.unitCost ?? null,
    reversal: Boolean(input.reversalOfId),
    originalValueDelta: input.originalValueDelta ?? null,
    originalValueKnown: input.originalValueKnown ?? input.originalValueDelta != null,
  });

  if (input.batchId) {
    await applyBatchDelta(tx, input.batchId, input.itemId, input.branchId, input.quantityDelta);
  }

  const movement = await tx.stockMovement.create({
    data: {
      branchId: input.branchId,
      itemId: input.itemId,
      quantityDelta: decToDb(input.quantityDelta),
      unitId: input.unitId,
      enteredQuantity: input.enteredQuantity ? decToDb(input.enteredQuantity) : null,
      enteredUnitId: input.enteredUnitId ?? null,
      movementType: input.movementType,
      occurredAt: input.occurredAt ?? new Date(),
      userId: input.userId,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      sourceRef: input.sourceRef ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      reversalOfId: input.reversalOfId ?? null,
      batchId: input.batchId ?? null,
      unitCost: input.unitCost ? decToDb(input.unitCost) : null,
      valueDelta: cost.valueDelta ? decToDb(cost.valueDelta) : null,
    },
  });

  const next = cost.next.onHandQty.eq(nextQty) ? cost.next : { ...cost.next, onHandQty: nextQty };
  await tx.branchItemCost.update({
    where: { branchId_itemId: { branchId: input.branchId, itemId: input.itemId } },
    data: {
      onHandQty: decToDb(next.onHandQty),
      totalValue: decToDb(next.totalValue),
      avgCost: next.avgCost ? decToDb(next.avgCost) : null,
      lastCost: next.lastCost ? decToDb(next.lastCost) : null,
      costComplete: next.costComplete,
    },
  });

  return { movement, created: true };
}

export async function getBalance(branchId: string, itemId: string, tx: Tx = prisma): Promise<Decimal> {
  const row = await tx.inventoryBalance.findUnique({
    where: { branchId_itemId: { branchId, itemId } },
  });
  return row ? D(row.quantity) : new Decimal(0);
}

export async function reconcileItem(branchId: string, itemId: string, tx: Tx = prisma) {
  const sum = await tx.stockMovement.aggregate({
    where: { branchId, itemId },
    _sum: { quantityDelta: true },
  });
  const ledger = sum._sum.quantityDelta ? D(sum._sum.quantityDelta) : new Decimal(0);
  const balance = await getBalance(branchId, itemId, tx);
  const cost = await tx.branchItemCost.findUnique({
    where: { branchId_itemId: { branchId, itemId } },
  });
  const costQty = cost ? D(cost.onHandQty) : new Decimal(0);
  return {
    ledger,
    balance,
    costQty,
    ok: balancesMatch(ledger, balance) && balancesMatch(ledger, costQty),
  };
}

export async function reverseMovement(
  tx: Tx,
  input: { movementId: string; userId: string; reason: string; idempotencyKey?: string },
): Promise<PostMovementResult> {
  const original = await tx.stockMovement.findUnique({ where: { id: input.movementId } });
  if (!original) throw new AppError("That stock movement was not found.", "NOT_FOUND", 404);
  const existingReversal = await tx.stockMovement.findUnique({ where: { reversalOfId: original.id } });
  if (existingReversal) return { movement: existingReversal, created: false };

  const result = await insertMovement(tx, {
    branchId: original.branchId,
    itemId: original.itemId,
    quantityDelta: D(original.quantityDelta).neg(),
    unitId: original.unitId,
    enteredQuantity: original.enteredQuantity ? D(original.enteredQuantity) : null,
    enteredUnitId: original.enteredUnitId,
    movementType: "REVERSAL",
    occurredAt: new Date(),
    userId: input.userId,
    referenceType: original.referenceType,
    referenceId: original.referenceId,
    reason: input.reason,
    notes: `Reversal of movement ${original.id}`,
    idempotencyKey: input.idempotencyKey ?? `reversal:${original.id}`,
    reversalOfId: original.id,
    batchId: original.batchId,
    originalValueDelta: original.valueDelta === null ? null : D(original.valueDelta),
    originalValueKnown: original.valueDelta !== null,
  });
  await audit(tx, {
    userId: input.userId,
    action: "movement.reverse",
    entityType: "stock_movement",
    entityId: original.id,
    branchId: original.branchId,
    metadata: { reversalId: result.movement.id, reason: input.reason },
  });
  return result;
}

export function emptyCost(): CostState {
  return emptyCostState();
}
