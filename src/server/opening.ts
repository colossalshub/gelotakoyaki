import type { Actor } from "@/domain/permissions";
import { parseOptionalCost, parseQty } from "@/domain/qty";
import { decToDb } from "@/domain/decimal";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { convertItemQuantity, costPerBase, loadUnitMap, requireItem } from "@/server/convert";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getBalance, postMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";

export type OpeningLineInput = {
  itemId: string;
  quantity: string;
  unitId: string;
  unitCost?: string;
};

export async function postOpening(
  actor: Actor,
  input: {
    branchId: string;
    lines: OpeningLineInput[];
    notes?: string;
    idempotencyKey: string;
    acknowledgeExisting?: boolean;
    occurredAt?: Date;
  },
) {
  assertCan(actor, "inventory.opening", input.branchId);
  if (!input.lines.length) throw new AppError("Add at least one opening line.");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.openingDocument.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch || !branch.active) throw new AppError("That branch is not available.", "NOT_FOUND", 404);

    const units = await loadUnitMap(tx);
    const prepared = [];
    for (const line of input.lines) {
      const item = await requireItem(tx, line.itemId, true);
      const entered = parseQty(line.quantity);
      const base = convertItemQuantity(item, units, line.unitId, entered);
      const balance = await getBalance(input.branchId, item.id, tx);
      const priorOpening = await tx.stockMovement.findFirst({
        where: { branchId: input.branchId, itemId: item.id, movementType: "OPENING" },
      });
      if ((balance.gt(0) || priorOpening) && !input.acknowledgeExisting) {
        throw new AppError(
          `${item.name} already has stock or an opening entry. Confirm that you intend to add another opening quantity.`,
          "EXISTING_STOCK",
        );
      }
      prepared.push({
        item,
        entered,
        unitId: line.unitId,
        base,
        unitCost: parseOptionalCost(line.unitCost),
      });
    }

    const doc = await tx.openingDocument.create({
      data: {
        number: await nextNumber(tx, "OPN"),
        branchId: input.branchId,
        status: "DRAFT",
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        createdById: actor.id,
        lines: {
          create: prepared.map((line) => ({
            itemId: line.item.id,
            enteredQuantity: decToDb(line.entered),
            enteredUnitId: line.unitId,
            unitCost: line.unitCost ? decToDb(line.unitCost) : null,
          })),
        },
      },
      include: { lines: true },
    });

    for (const line of doc.lines) {
      const match = prepared.find((entry) => entry.item.id === line.itemId && entry.unitId === line.enteredUnitId);
      if (!match) throw new AppError("Could not match an opening line.", "LINE");
      const posted = await postMovement(
        {
          branchId: input.branchId,
          itemId: line.itemId,
          quantityDelta: match.base,
          unitId: match.item.baseUnitId,
          enteredQuantity: match.entered,
          enteredUnitId: line.enteredUnitId,
          movementType: "OPENING",
          occurredAt: input.occurredAt,
          userId: actor.id,
          referenceType: "OPENING",
          referenceId: doc.id,
          idempotencyKey: `opening:${doc.id}:${line.id}`,
          unitCost: costPerBase(match.entered, match.base, match.unitCost),
          notes: input.notes ?? null,
        },
        tx,
      );
      await tx.openingLine.update({
        where: { id: line.id },
        data: { baseQuantity: decToDb(match.base), movementId: posted.movement.id },
      });
    }

    const postedDoc = await tx.openingDocument.update({
      where: { id: doc.id },
      data: { status: "POSTED", postedAt: new Date(), postedById: actor.id },
    });
    await audit(tx, {
      userId: actor.id,
      action: "opening.post",
      entityType: "opening_document",
      entityId: doc.id,
      branchId: input.branchId,
    });
    return postedDoc;
  });
}
