import type { Actor } from "@/domain/permissions";
import { DISCREPANCY_REASONS } from "@/domain/constants";
import { D, decToDb, Decimal } from "@/domain/decimal";
import { parseOptionalQty, parseQty } from "@/domain/qty";
import { inTransitQuantity } from "@/domain/transfers";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { convertItemQuantity, loadUnitMap, requireItem } from "@/server/convert";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { postMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";
import { getPolicy } from "@/server/settings";

const REASON_CODES = new Set<string>(DISCREPANCY_REASONS.map((reason) => reason.code));

export async function createTransfer(
  actor: Actor,
  input: {
    sourceBranchId: string;
    destBranchId: string;
    notes?: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string }>;
  },
) {
  assertCan(actor, "inventory.transfer.request", input.sourceBranchId);
  if (input.sourceBranchId === input.destBranchId) {
    throw new AppError("Choose two different branches.");
  }
  if (!input.lines.length) throw new AppError("Add at least one item to transfer.");
  const destVisible = actor.role === "OWNER" || actor.branches.some((branch) => branch.branchId === input.destBranchId);
  if (!destVisible) throw new AppError("You do not have access to the destination branch.", "FORBIDDEN", 403);

  return prisma.$transaction(async (tx) => {
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
      });
    }
    return tx.stockTransfer.create({
      data: {
        number: await nextNumber(tx, "TRF"),
        sourceBranchId: input.sourceBranchId,
        destBranchId: input.destBranchId,
        notes: input.notes ?? null,
        requestedById: actor.id,
        status: "DRAFT",
        lines: {
          create: prepared.map((line) => ({
            itemId: line.item.id,
            unitId: line.unitId,
            enteredQuantity: decToDb(line.entered),
            requestedQty: decToDb(line.base),
          })),
        },
      },
    });
  });
}

export async function requestTransfer(actor: Actor, transferId: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, transferId);
    assertCan(actor, "inventory.transfer.request", transfer.sourceBranchId);
    if (transfer.status === "REQUESTED") return transfer;
    if (transfer.status !== "DRAFT") throw new AppError("This transfer can no longer be requested.");
    return tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "REQUESTED" } });
  });
}

export async function dispatchTransfer(actor: Actor, transferId: string, dispatchKey: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, transferId);
    assertCan(actor, "inventory.transfer.dispatch", transfer.sourceBranchId);
    if (transfer.status === "DISPATCHED" || transfer.status === "PARTIALLY_RECEIVED" || transfer.status === "RECEIVED") {
      return transfer;
    }
    if (transfer.status !== "REQUESTED") throw new AppError("Request the transfer before dispatching it.");
    const lines = [...transfer.lines].sort((a, b) => a.itemId.localeCompare(b.itemId));
    for (const line of lines) {
      const item = await requireItem(tx, line.itemId, true);
      const qty = D(line.requestedQty);
      const posted = await postMovement(
        {
          branchId: transfer.sourceBranchId,
          itemId: line.itemId,
          quantityDelta: qty.neg(),
          unitId: item.baseUnitId,
          enteredQuantity: D(line.enteredQuantity),
          enteredUnitId: line.unitId,
          movementType: "TRANSFER_OUT",
          userId: actor.id,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          idempotencyKey: `transfer-out:${transfer.id}:${line.id}`,
          notes: transfer.notes,
        },
        tx,
      );
      await tx.stockTransferLine.update({
        where: { id: line.id },
        data: { dispatchedQty: decToDb(qty), dispatchMovementId: posted.movement.id },
      });
    }
    const dispatched = await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        dispatchedById: actor.id,
        dispatchKey,
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "transfer.dispatch",
      entityType: "stock_transfer",
      entityId: transfer.id,
      branchId: transfer.sourceBranchId,
    });
    return dispatched;
  });
}

export async function receiveTransfer(
  actor: Actor,
  input: {
    transferId: string;
    idempotencyKey: string;
    lines: Array<{ lineId: string; receivedQty: string; damagedQty?: string; rejectedQty?: string; notes?: string; reason?: string }>;
  },
) {
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, input.transferId);
    assertCan(actor, "inventory.transfer.receive", transfer.destBranchId);
    if (!["DISPATCHED", "PARTIALLY_RECEIVED"].includes(transfer.status)) {
      throw new AppError("This transfer is not waiting to be received.");
    }
    const marker = `${input.idempotencyKey}:${input.lines[0]?.lineId ?? "none"}`;
    const duplicate = await tx.transferReceipt.findUnique({ where: { idempotencyKey: marker } });
    if (duplicate) return transfer;

    const policy = await getPolicy(tx);
    const units = await loadUnitMap(tx);
    for (const entry of input.lines) {
      const line = transfer.lines.find((candidate) => candidate.id === entry.lineId);
      if (!line) throw new AppError("That transfer line was not found.");
      const item = await requireItem(tx, line.itemId, true);
      const receivedEntered = parseOptionalQty(entry.receivedQty);
      const damagedEntered = parseOptionalQty(entry.damagedQty);
      const rejectedEntered = parseOptionalQty(entry.rejectedQty);
      if (receivedEntered.plus(damagedEntered).plus(rejectedEntered).lte(0)) {
        throw new AppError("Enter the quantity received, damaged, or rejected.");
      }
      if ((damagedEntered.gt(0) || rejectedEntered.gt(0)) && !entry.reason?.trim()) {
        throw new AppError("Damaged or rejected quantities need an explanation.");
      }
      if (
        policy.requireTransferDiscrepancyApproval &&
        (damagedEntered.gt(0) || rejectedEntered.gt(0)) &&
        !actorCanResolve(actor, transfer.destBranchId)
      ) {
        throw new AppError("An authorised reviewer must record damaged or rejected transfer quantities.");
      }
      const receivedBase = receivedEntered.gt(0) ? convertItemQuantity(item, units, line.unitId, receivedEntered) : new Decimal(0);
      const damagedBase = damagedEntered.gt(0) ? convertItemQuantity(item, units, line.unitId, damagedEntered) : new Decimal(0);
      const rejectedBase = rejectedEntered.gt(0) ? convertItemQuantity(item, units, line.unitId, rejectedEntered) : new Decimal(0);
      const remaining = inTransitQuantity(line);
      const claimed = receivedBase.plus(damagedBase).plus(rejectedBase);
      if (claimed.gt(remaining)) {
        throw new AppError("That quantity is more than the stock still in transit.");
      }
      let movementId: string | null = null;
      if (receivedBase.gt(0)) {
        const posted = await postMovement(
          {
            branchId: transfer.destBranchId,
            itemId: line.itemId,
            quantityDelta: receivedBase,
            unitId: item.baseUnitId,
            enteredQuantity: receivedEntered,
            enteredUnitId: line.unitId,
            movementType: "TRANSFER_IN",
            userId: actor.id,
            referenceType: "TRANSFER",
            referenceId: transfer.id,
            idempotencyKey: `transfer-in:${input.idempotencyKey}:${line.id}`,
            notes: entry.notes ?? null,
          },
          tx,
        );
        movementId = posted.movement.id;
      }
      await tx.transferReceipt.create({
        data: {
          transferId: transfer.id,
          lineId: line.id,
          idempotencyKey: `${input.idempotencyKey}:${line.id}`,
          receivedQty: decToDb(receivedBase),
          damagedQty: decToDb(damagedBase),
          rejectedQty: decToDb(rejectedBase),
          notes: entry.notes ?? entry.reason ?? null,
          receivedById: actor.id,
          movementId,
        },
      });
      await tx.stockTransferLine.update({
        where: { id: line.id },
        data: {
          receivedQty: decToDb(D(line.receivedQty).plus(receivedBase)),
          damagedQty: decToDb(D(line.damagedQty).plus(damagedBase)),
          rejectedQty: decToDb(D(line.rejectedQty).plus(rejectedBase)),
          discrepancyReason: entry.reason ?? line.discrepancyReason,
          discrepancyNotes: entry.notes ?? line.discrepancyNotes,
        },
      });
      line.receivedQty = decToDb(D(line.receivedQty).plus(receivedBase)) as unknown as typeof line.receivedQty;
      line.damagedQty = decToDb(D(line.damagedQty).plus(damagedBase)) as unknown as typeof line.damagedQty;
      line.rejectedQty = decToDb(D(line.rejectedQty).plus(rejectedBase)) as unknown as typeof line.rejectedQty;
    }

    const refreshed = await tx.stockTransferLine.findMany({ where: { transferId: transfer.id } });
    const open = refreshed.some((line) => inTransitQuantity(line).gt(0));
    const status = open ? "PARTIALLY_RECEIVED" : "RECEIVED";
    const updated = await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status } });
    await audit(tx, {
      userId: actor.id,
      action: "transfer.receive",
      entityType: "stock_transfer",
      entityId: transfer.id,
      branchId: transfer.destBranchId,
    });
    return updated;
  });
}

export async function resolveTransferDiscrepancy(
  actor: Actor,
  input: { transferId: string; lineId: string; quantity: string; reason: string; notes?: string },
) {
  if (!REASON_CODES.has(input.reason)) throw new AppError("Choose a discrepancy reason.");
  if (!input.notes?.trim()) throw new AppError("Explain the transfer discrepancy before closing it.");
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, input.transferId);
    assertCan(actor, "inventory.transfer.resolve", transfer.destBranchId);
    const line = transfer.lines.find((candidate) => candidate.id === input.lineId);
    if (!line) throw new AppError("That transfer line was not found.");
    const qty = parseQty(input.quantity);
    const remaining = inTransitQuantity(line);
    if (qty.gt(remaining)) throw new AppError("The unresolved quantity is smaller than that.");
    await tx.stockTransferLine.update({
      where: { id: line.id },
      data: {
        lossQty: decToDb(D(line.lossQty).plus(qty)),
        discrepancyReason: input.reason,
        discrepancyNotes: input.notes?.trim(),
        discrepancyApprovedById: actor.id,
      },
    });
    const refreshed = await tx.stockTransferLine.findMany({ where: { transferId: transfer.id } });
    const open = refreshed.some((candidate) => inTransitQuantity(candidate).gt(0));
    await audit(tx, {
      userId: actor.id,
      action: "transfer.resolve",
      entityType: "stock_transfer",
      entityId: transfer.id,
      branchId: transfer.destBranchId,
      metadata: { lineId: line.id, quantity: qty.toFixed(), reason: input.reason },
    });
    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: open ? "PARTIALLY_RECEIVED" : "RECEIVED" },
    });
  });
}

function actorCanResolve(actor: Actor, branchId: string): boolean {
  if (actor.role === "OWNER") return true;
  if (actor.role !== "BRANCH_MANAGER") return false;
  return actor.branches.some((branch) => branch.branchId === branchId && branch.canApproveAdjustments);
}

async function lockTransfer(tx: Tx, transferId: string) {
  await tx.$queryRaw`SELECT id FROM stock_transfers WHERE id = CAST(${transferId} AS uuid) FOR UPDATE`;
  const transfer = await tx.stockTransfer.findUnique({
    where: { id: transferId },
    include: { lines: true },
  });
  if (!transfer) throw new AppError("That transfer was not found.", "NOT_FOUND", 404);
  return transfer;
}

export async function eligibleIncoming(branchId: string, itemId: string, tx: Tx = prisma): Promise<Decimal> {
  const lines = await tx.stockTransferLine.findMany({
    where: {
      itemId,
      transfer: {
        destBranchId: branchId,
        status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED"] },
      },
    },
  });
  return lines.reduce((sum, line) => sum.plus(Decimal.max(new Decimal(0), inTransitQuantity(line))), new Decimal(0));
}
