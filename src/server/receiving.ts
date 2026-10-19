import type { Actor } from "@/domain/permissions";
import { D, decToDb, Decimal } from "@/domain/decimal";
import { parseOptionalCost, parseOptionalQty, parseQty } from "@/domain/qty";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { convertItemQuantity, costPerBase, loadUnitMap, requireItem } from "@/server/convert";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { postMovement, reverseMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";

export type ReceiptLineInput = {
  itemId: string;
  quantity: string;
  unitId: string;
  damaged?: string;
  rejected?: string;
  unitCost?: string;
  lotCode?: string;
  expiryDate?: string;
  notes?: string;
  purchaseOrderLineId?: string;
};

async function prepareReceiptLines(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  lines: ReceiptLineInput[],
) {
  if (!lines.length) throw new AppError("Add at least one receipt line.");
  const units = await loadUnitMap(tx);
  const prepared = [];
  for (const line of lines) {
    const item = await requireItem(tx, line.itemId);
    const delivered = parseQty(line.quantity);
    const damaged = parseOptionalQty(line.damaged);
    const rejected = parseOptionalQty(line.rejected);
    const accepted = delivered.minus(damaged).minus(rejected);
    if (accepted.isNeg()) {
      throw new AppError("Damaged and rejected quantities cannot exceed the quantity received.");
    }
    if (item.tracksBatch && !line.lotCode?.trim()) {
      throw new AppError(`${item.name} requires a lot or batch code.`);
    }
    if (item.tracksExpiry && !line.expiryDate) {
      throw new AppError(`${item.name} requires an expiry date.`);
    }
    const base = accepted.gt(0) ? convertItemQuantity(item, units, line.unitId, accepted) : new Decimal(0);
    prepared.push({
      item,
      delivered,
      damaged,
      rejected,
      accepted,
      base,
      unitId: line.unitId,
      unitCost: parseOptionalCost(line.unitCost),
      lotCode: line.lotCode?.trim() || null,
      expiryDate: line.expiryDate ? new Date(`${line.expiryDate}T00:00:00.000Z`) : null,
      notes: line.notes?.trim() || null,
      purchaseOrderLineId: line.purchaseOrderLineId,
    });
  }
  return prepared;
}

export async function saveReceiptDraft(
  actor: Actor,
  input: {
    id?: string;
    branchId: string;
    supplierId?: string | null;
    purchaseOrderId?: string | null;
    invoiceRef?: string;
    notes?: string;
    lines: ReceiptLineInput[];
    idempotencyKey?: string;
  },
) {
  assertCan(actor, "inventory.receive", input.branchId);
  return prisma.$transaction(async (tx) => {
    const prepared = await prepareReceiptLines(tx, input.lines);
    const lineData = prepared.map((line) => ({
      itemId: line.item.id,
      enteredQuantity: decToDb(line.delivered),
      enteredUnitId: line.unitId,
      acceptedQuantity: decToDb(line.accepted),
      damagedQuantity: decToDb(line.damaged),
      rejectedQuantity: decToDb(line.rejected),
      unitCost: line.unitCost ? decToDb(line.unitCost) : null,
      lotCode: line.lotCode,
      expiryDate: line.expiryDate,
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
    }));

    if (input.id) {
      const current = await tx.goodsReceipt.findUnique({ where: { id: input.id } });
      if (!current) throw new AppError("That receipt was not found.", "NOT_FOUND", 404);
      if (current.branchId !== input.branchId) {
        throw new AppError("You do not have access to that branch.", "FORBIDDEN", 403);
      }
      if (current.status !== "DRAFT") throw new AppError("Posted receipts cannot be edited. Reverse and record a correction.");
      await tx.goodsReceiptLine.deleteMany({ where: { receiptId: current.id } });
      return tx.goodsReceipt.update({
        where: { id: current.id },
        data: {
          supplierId: input.supplierId || null,
          purchaseOrderId: input.purchaseOrderId || null,
          invoiceRef: input.invoiceRef || null,
          notes: input.notes || null,
          lines: { create: lineData },
        },
      });
    }

    return tx.goodsReceipt.create({
      data: {
        number: await nextNumber(tx, "RCV"),
        branchId: input.branchId,
        supplierId: input.supplierId || null,
        purchaseOrderId: input.purchaseOrderId || null,
        invoiceRef: input.invoiceRef || null,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey || null,
        createdById: actor.id,
        lines: { create: lineData },
      },
    });
  });
}

export async function postReceipt(actor: Actor, receiptId: string, idempotencyKey?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM goods_receipts WHERE id = CAST(${receiptId} AS uuid) FOR UPDATE`;
    const receipt = await tx.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: true },
    });
    if (!receipt) throw new AppError("That receipt was not found.", "NOT_FOUND", 404);
    assertCan(actor, "inventory.receive", receipt.branchId);
    if (receipt.status === "POSTED" || receipt.status === "REVERSED") return receipt;
    if (idempotencyKey && receipt.idempotencyKey && receipt.idempotencyKey !== idempotencyKey) {
      throw new AppError("This receipt is already tied to a different submission.");
    }

    const units = await loadUnitMap(tx);
    for (const line of receipt.lines) {
      const item = await requireItem(tx, line.itemId);
      const accepted = D(line.acceptedQuantity);
      if (accepted.lte(0)) continue;
      const base = convertItemQuantity(item, units, line.enteredUnitId, accepted);
      let batchId: string | null = null;
      if (line.lotCode || line.expiryDate || item.tracksBatch) {
        const batch = await tx.itemBatch.create({
          data: {
            itemId: item.id,
            branchId: receipt.branchId,
            lotCode: line.lotCode || "UNSPECIFIED",
            expiryDate: line.expiryDate,
            remainingQty: 0,
          },
        });
        batchId = batch.id;
      }
      const unitCost = line.unitCost ? D(line.unitCost) : null;
      const posted = await postMovement(
        {
          branchId: receipt.branchId,
          itemId: item.id,
          quantityDelta: base,
          unitId: item.baseUnitId,
          enteredQuantity: accepted,
          enteredUnitId: line.enteredUnitId,
          movementType: "SUPPLIER_RECEIPT",
          userId: actor.id,
          referenceType: "GOODS_RECEIPT",
          referenceId: receipt.id,
          idempotencyKey: `receipt:${receipt.id}:${line.id}`,
          sourceRef: receipt.invoiceRef,
          batchId,
          unitCost: costPerBase(accepted, base, unitCost),
          notes: receipt.notes,
        },
        tx,
      );
      await tx.goodsReceiptLine.update({
        where: { id: line.id },
        data: { baseQuantity: decToDb(base), movementId: posted.movement.id },
      });
      if (line.purchaseOrderLineId) {
        const poLine = await tx.purchaseOrderLine.findUnique({ where: { id: line.purchaseOrderLineId } });
        if (!poLine) throw new AppError("The purchase order line was not found.");
        if (poLine.unitId !== line.enteredUnitId) {
          throw new AppError("Receive this purchase order in the unit that was ordered.");
        }
        const nextReceived = D(poLine.receivedQty).plus(accepted);
        if (nextReceived.gt(D(poLine.orderedQty))) {
          throw new AppError("That receipt would exceed the quantity still open on the purchase order.");
        }
        await tx.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: { receivedQty: decToDb(nextReceived) },
        });
      }
    }

    if (receipt.purchaseOrderId) await refreshPurchaseOrder(tx, receipt.purchaseOrderId);

    const posted = await tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedById: actor.id,
        receivedAt: new Date(),
        idempotencyKey: receipt.idempotencyKey ?? idempotencyKey ?? `receipt-post:${receipt.id}`,
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "receipt.post",
      entityType: "goods_receipt",
      entityId: receipt.id,
      branchId: receipt.branchId,
      metadata: { number: receipt.number },
    });
    return posted;
  });
}

export async function postReceiptNow(
  actor: Actor,
  input: {
    branchId: string;
    supplierId?: string | null;
    purchaseOrderId?: string | null;
    invoiceRef?: string;
    notes?: string;
    lines: ReceiptLineInput[];
    idempotencyKey: string;
  },
) {
  const existing = await prisma.goodsReceipt.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing?.status === "POSTED" || existing?.status === "REVERSED") return existing;
  if (existing?.status === "DRAFT") {
    await saveReceiptDraft(actor, { ...input, id: existing.id });
    return postReceipt(actor, existing.id, input.idempotencyKey);
  }
  const draft = await saveReceiptDraft(actor, input);
  return postReceipt(actor, draft.id, input.idempotencyKey);
}

async function refreshPurchaseOrder(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], orderId: string) {
  const order = await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order || order.status === "CANCELLED" || order.status === "DRAFT") return;
  const allReceived = order.lines.every((line) => D(line.receivedQty).gte(D(line.orderedQty)));
  const anyReceived = order.lines.some((line) => D(line.receivedQty).gt(0));
  await tx.purchaseOrder.update({
    where: { id: orderId },
    data: { status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED" },
  });
}

export async function reverseReceipt(actor: Actor, receiptId: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reversal needs a reason.");
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: true },
    });
    if (!receipt) throw new AppError("That receipt was not found.", "NOT_FOUND", 404);
    assertCan(actor, "inventory.reverse", receipt.branchId);
    if (receipt.status === "REVERSED") return receipt;
    if (receipt.status !== "POSTED") throw new AppError("Only a posted receipt can be reversed.");
    for (const line of receipt.lines) {
      if (!line.movementId) continue;
      await reverseMovement(tx, { movementId: line.movementId, userId: actor.id, reason: reason.trim() });
      if (line.purchaseOrderLineId && line.baseQuantity) {
        const poLine = await tx.purchaseOrderLine.findUnique({ where: { id: line.purchaseOrderLineId } });
        if (poLine) {
          const next = Decimal.max(new Decimal(0), D(poLine.receivedQty).minus(D(line.acceptedQuantity)));
          await tx.purchaseOrderLine.update({
            where: { id: poLine.id },
            data: { receivedQty: decToDb(next) },
          });
        }
      }
    }
    if (receipt.purchaseOrderId) await refreshPurchaseOrder(tx, receipt.purchaseOrderId);
    const reversed = await tx.goodsReceipt.update({
      where: { id: receipt.id },
      data: { status: "REVERSED" },
    });
    await audit(tx, {
      userId: actor.id,
      action: "receipt.reverse",
      entityType: "goods_receipt",
      entityId: receipt.id,
      branchId: receipt.branchId,
      metadata: { reason: reason.trim() },
    });
    return reversed;
  });
}

export async function postSupplierReturn(
  actor: Actor,
  input: {
    branchId: string;
    supplierId?: string | null;
    reference?: string;
    notes?: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string; reason?: string }>;
    idempotencyKey: string;
  },
) {
  assertCan(actor, "inventory.receive", input.branchId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierReturn.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const units = await loadUnitMap(tx);
    const prepared = [];
    for (const line of input.lines) {
      const item = await requireItem(tx, line.itemId, true);
      const entered = parseQty(line.quantity);
      const base = convertItemQuantity(item, units, line.unitId, entered);
      prepared.push({ item, entered, base, unitId: line.unitId, reason: line.reason?.trim() || null });
    }
    const doc = await tx.supplierReturn.create({
      data: {
        number: await nextNumber(tx, "RET"),
        branchId: input.branchId,
        supplierId: input.supplierId || null,
        reference: input.reference || null,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey,
        createdById: actor.id,
        status: "DRAFT",
        lines: {
          create: prepared.map((line) => ({
            itemId: line.item.id,
            enteredQuantity: decToDb(line.entered),
            enteredUnitId: line.unitId,
            reason: line.reason,
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
          movementType: "SUPPLIER_RETURN",
          userId: actor.id,
          referenceType: "SUPPLIER_RETURN",
          referenceId: doc.id,
          idempotencyKey: `return:${doc.id}:${line.id}`,
          reason: match.reason,
        },
        tx,
      );
      await tx.supplierReturnLine.update({
        where: { id: line.id },
        data: { baseQuantity: decToDb(match.base), movementId: posted.movement.id },
      });
    }
    return tx.supplierReturn.update({
      where: { id: doc.id },
      data: { status: "POSTED", postedAt: new Date(), postedById: actor.id },
    });
  });
}
