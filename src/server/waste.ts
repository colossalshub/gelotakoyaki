import type { Actor } from "@/domain/permissions";
import { WASTE_REASONS } from "@/domain/constants";
import { decToDb } from "@/domain/decimal";
import { parseQty } from "@/domain/qty";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { convertItemQuantity, loadUnitMap, requireItem } from "@/server/convert";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { postMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";

const WASTE_CODES = new Set(WASTE_REASONS.map((reason) => reason.code));

export async function postWaste(
  actor: Actor,
  input: {
    branchId: string;
    occurredAt?: Date;
    notes?: string;
    idempotencyKey: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string; reason: string; notes?: string; batchId?: string }>;
  },
) {
  assertCan(actor, "inventory.waste", input.branchId);
  if (!input.lines.length) throw new AppError("Add at least one waste line.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.wasteRecord.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const units = await loadUnitMap(tx);
    const prepared = [];
    for (const line of input.lines) {
      if (!WASTE_CODES.has(line.reason as (typeof WASTE_REASONS)[number]["code"])) {
        throw new AppError("Choose a waste reason.");
      }
      const item = await requireItem(tx, line.itemId, true);
      const entered = parseQty(line.quantity);
      prepared.push({
        item,
        entered,
        unitId: line.unitId,
        base: convertItemQuantity(item, units, line.unitId, entered),
        reason: line.reason,
        notes: line.notes?.trim() || null,
        batchId: line.batchId || null,
      });
    }
    const doc = await tx.wasteRecord.create({
      data: {
        number: await nextNumber(tx, "WST"),
        branchId: input.branchId,
        occurredAt: input.occurredAt ?? new Date(),
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        createdById: actor.id,
        lines: {
          create: prepared.map((line) => ({
            itemId: line.item.id,
            enteredQuantity: decToDb(line.entered),
            enteredUnitId: line.unitId,
            reason: line.reason,
            notes: line.notes,
            batchId: line.batchId,
          })),
        },
      },
      include: { lines: true },
    });
    for (const line of doc.lines) {
      const match = prepared.find((entry) => entry.item.id === line.itemId);
      if (!match) continue;
      const posted = await postMovement(
        {
          branchId: input.branchId,
          itemId: line.itemId,
          quantityDelta: match.base.neg(),
          unitId: match.item.baseUnitId,
          enteredQuantity: match.entered,
          enteredUnitId: line.enteredUnitId,
          movementType: "WASTE",
          occurredAt: input.occurredAt,
          userId: actor.id,
          referenceType: "WASTE",
          referenceId: doc.id,
          reason: match.reason,
          notes: match.notes,
          idempotencyKey: `waste:${doc.id}:${line.id}`,
          batchId: match.batchId,
        },
        tx,
      );
      await tx.wasteLine.update({
        where: { id: line.id },
        data: { baseQuantity: decToDb(match.base), movementId: posted.movement.id },
      });
    }
    const postedDoc = await tx.wasteRecord.update({
      where: { id: doc.id },
      data: { status: "POSTED", postedAt: new Date(), postedById: actor.id },
    });
    await audit(tx, {
      userId: actor.id,
      action: "waste.post",
      entityType: "waste_record",
      entityId: doc.id,
      branchId: input.branchId,
    });
    return postedDoc;
  });
}
