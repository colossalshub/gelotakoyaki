import type { UsageKind } from "@prisma/client";
import type { Actor } from "@/domain/permissions";
import { decToDb } from "@/domain/decimal";
import { parseQty } from "@/domain/qty";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { convertItemQuantity, loadUnitMap, requireItem } from "@/server/convert";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { postMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";

export async function postUsage(
  actor: Actor,
  input: {
    branchId: string;
    kind: UsageKind;
    occurredAt?: Date;
    notes?: string;
    idempotencyKey: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string; notes?: string }>;
  },
) {
  assertCan(actor, "inventory.usage", input.branchId);
  if (!input.lines.length) throw new AppError("Add at least one line.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.usageRecord.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const units = await loadUnitMap(tx);
    const prepared = [];
    for (const line of input.lines) {
      const item = await requireItem(tx, line.itemId, true);
      const entered = parseQty(line.quantity);
      prepared.push({
        item,
        entered,
        unitId: line.unitId,
        base: convertItemQuantity(item, units, line.unitId, entered),
        notes: line.notes?.trim() || null,
      });
    }
    const doc = await tx.usageRecord.create({
      data: {
        number: await nextNumber(tx, input.kind === "RETURN" ? "RTN" : "USE"),
        branchId: input.branchId,
        kind: input.kind,
        occurredAt: input.occurredAt ?? new Date(),
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        createdById: actor.id,
        lines: {
          create: prepared.map((line) => ({
            itemId: line.item.id,
            enteredQuantity: decToDb(line.entered),
            enteredUnitId: line.unitId,
            notes: line.notes,
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
          quantityDelta: input.kind === "RETURN" ? match.base : match.base.neg(),
          unitId: match.item.baseUnitId,
          enteredQuantity: match.entered,
          enteredUnitId: line.enteredUnitId,
          movementType: input.kind === "RETURN" ? "OPERATIONAL_RETURN" : "ACTUAL_USAGE",
          occurredAt: input.occurredAt,
          userId: actor.id,
          referenceType: "USAGE",
          referenceId: doc.id,
          idempotencyKey: `usage:${doc.id}:${line.id}`,
          notes: match.notes ?? input.notes ?? null,
        },
        tx,
      );
      await tx.usageLine.update({
        where: { id: line.id },
        data: { baseQuantity: decToDb(match.base), movementId: posted.movement.id },
      });
    }
    const postedDoc = await tx.usageRecord.update({
      where: { id: doc.id },
      data: { status: "POSTED", postedAt: new Date(), postedById: actor.id },
    });
    await audit(tx, {
      userId: actor.id,
      action: input.kind === "RETURN" ? "usage.return" : "usage.post",
      entityType: "usage_record",
      entityId: doc.id,
      branchId: input.branchId,
    });
    return postedDoc;
  });
}
