import type { Actor } from "@/domain/permissions";
import { DISCREPANCY_REASONS } from "@/domain/constants";
import { D, decToDb } from "@/domain/decimal";
import { varianceQuantity, varianceValue } from "@/domain/inventory-math";
import { parseQty } from "@/domain/qty";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { getBalance, postMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";
import { getPolicy } from "@/server/settings";

const REASONS = new Set<string>(DISCREPANCY_REASONS.map((reason) => reason.code));

export async function createCount(
  actor: Actor,
  input: { branchId: string; itemIds: string[]; notes?: string },
) {
  assertCan(actor, "inventory.count.submit", input.branchId);
  if (!input.itemIds.length) throw new AppError("Choose at least one item to count.");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const uniqueIds = [...new Set(input.itemIds)];
    const lines = [];
    for (const itemId of uniqueIds) {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) throw new AppError("That item was not found.", "NOT_FOUND", 404);
      lines.push({
        itemId,
        expectedQty: decToDb(await getBalance(input.branchId, itemId, tx)),
        snapshotAt: now,
      });
    }
    const count = await tx.stockCount.create({
      data: {
        number: await nextNumber(tx, "CNT"),
        branchId: input.branchId,
        notes: input.notes ?? null,
        counterId: actor.id,
        lines: { create: lines },
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "count.create",
      entityType: "stock_count",
      entityId: count.id,
      branchId: input.branchId,
    });
    return count;
  });
}

export async function resnapshotCount(actor: Actor, countId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, countId);
    assertCan(actor, "inventory.count.submit", count.branchId);
    if (count.status !== "DRAFT") throw new AppError("Only a draft count can be re-snapshotted.");
    const now = new Date();
    for (const line of count.lines) {
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: { expectedQty: decToDb(await getBalance(count.branchId, line.itemId, tx)), snapshotAt: now },
      });
    }
    return tx.stockCount.findUniqueOrThrow({ where: { id: count.id } });
  });
}

export async function recordCount(
  actor: Actor,
  countId: string,
  entries: Array<{ itemId: string; countedQty: string; reasonCode?: string; notes?: string }>,
) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, countId);
    assertCan(actor, "inventory.count.submit", count.branchId);
    if (count.status !== "DRAFT") throw new AppError("This count is no longer a draft.");
    for (const entry of entries) {
      const line = count.lines.find((candidate) => candidate.itemId === entry.itemId);
      if (!line) throw new AppError("That item is not on this count.");
      const counted = parseQty(entry.countedQty, { allowZero: true });
      const variance = varianceQuantity(counted, D(line.expectedQty));
      if (!variance.isZero() && entry.reasonCode && !REASONS.has(entry.reasonCode)) {
        throw new AppError("Choose a discrepancy reason.");
      }
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: {
          countedQty: decToDb(counted),
          varianceQty: decToDb(variance),
          reasonCode: entry.reasonCode || null,
          notes: entry.notes?.trim() || null,
        },
      });
    }
    return tx.stockCount.findUniqueOrThrow({ where: { id: count.id } });
  });
}

export async function submitCount(actor: Actor, countId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, countId);
    assertCan(actor, "inventory.count.submit", count.branchId);
    if (count.status === "SUBMITTED") return count;
    if (count.status !== "DRAFT") throw new AppError("This count cannot be submitted.");
    for (const line of count.lines) {
      if (line.countedQty === null || line.varianceQty === null) {
        throw new AppError("Enter a counted quantity for every item before submitting.");
      }
      if (!D(line.varianceQty).isZero() && !line.reasonCode) {
        throw new AppError("Each shortage or overage needs a reason before the count is submitted.");
      }
    }
    return tx.stockCount.update({ where: { id: count.id }, data: { status: "SUBMITTED" } });
  });
}

export async function reviewCount(actor: Actor, countId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, countId);
    assertCan(actor, "inventory.count.review", count.branchId);
    const policy = await getPolicy(tx);
    if (count.status === "REVIEWED") return count;
    if (count.status !== "SUBMITTED") throw new AppError("Submit the count before review.");
    if (policy.separateCountDuties && count.counterId === actor.id) {
      throw new AppError("Someone other than the counter must review this count.");
    }
    return tx.stockCount.update({
      where: { id: count.id },
      data: { status: "REVIEWED", reviewerId: actor.id, reviewedAt: new Date() },
    });
  });
}

export async function finalizeCount(actor: Actor, countId: string, finalizeKey: string) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, countId);
    if (count.status === "FINALIZED") return count;
    assertCan(actor, "inventory.count.finalize", count.branchId);
    const policy = await getPolicy(tx);
    if (policy.requireCountApproval && count.status !== "REVIEWED") {
      throw new AppError("This count has to be reviewed before it can be finalized.");
    }
    if (!policy.requireCountApproval && !["SUBMITTED", "REVIEWED"].includes(count.status)) {
      throw new AppError("Submit the count before finalizing it.");
    }
    if (policy.separateCountDuties && count.counterId === actor.id) {
      throw new AppError("Someone other than the counter must finalize this count.");
    }
    const latestSnapshot = count.lines.reduce(
      (latest, line) => (line.snapshotAt > latest ? line.snapshotAt : latest),
      count.lines[0]?.snapshotAt ?? count.createdAt,
    );
    const later = await tx.stockMovement.count({
      where: {
        branchId: count.branchId,
        itemId: { in: count.lines.map((line) => line.itemId) },
        OR: [{ createdAt: { gt: latestSnapshot } }, { occurredAt: { gt: latestSnapshot } }],
      },
    });
    if (later > 0) {
      throw new AppError(
        "Stock moved after this count was snapshotted. Reopen the draft and re-snapshot, or start a new count. Variances are not mixed across measurement times.",
      );
    }
    for (const line of count.lines) {
      if (line.countedQty === null) throw new AppError("Every counted line needs a quantity.");
      const variance = varianceQuantity(D(line.countedQty), D(line.expectedQty));
      const cost = await tx.branchItemCost.findUnique({
        where: { branchId_itemId: { branchId: count.branchId, itemId: line.itemId } },
      });
      const impact = varianceValue(
        variance,
        cost?.avgCost ? D(cost.avgCost) : null,
        cost?.costComplete ?? false,
      );
      let movementId: string | null = null;
      if (!variance.isZero()) {
        const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
        const posted = await postMovement(
          {
            branchId: count.branchId,
            itemId: line.itemId,
            quantityDelta: variance,
            unitId: item.baseUnitId,
            movementType: "ADJUSTMENT",
            userId: actor.id,
            referenceType: "STOCK_COUNT",
            referenceId: count.id,
            reason: line.reasonCode,
            notes: line.notes,
            idempotencyKey: `count:${count.id}:${line.id}`,
          },
          tx,
        );
        movementId = posted.movement.id;
      }
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: {
          varianceQty: decToDb(variance),
          varianceCost: impact.cost ? decToDb(impact.cost) : null,
          costKnown: impact.known,
          adjustmentMovementId: movementId,
        },
      });
    }
    const finalized = await tx.stockCount.update({
      where: { id: count.id },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
        finalizedById: actor.id,
        finalizeKey,
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "count.finalize",
      entityType: "stock_count",
      entityId: count.id,
      branchId: count.branchId,
    });
    return finalized;
  });
}

export async function reopenCount(actor: Actor, countId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, countId);
    assertCan(actor, "inventory.count.review", count.branchId);
    if (count.status === "FINALIZED") throw new AppError("A finalized count stays on record. Start a new count to correct it.");
    if (count.status === "DRAFT") return count;
    return tx.stockCount.update({
      where: { id: count.id },
      data: { status: "DRAFT", reviewerId: null, reviewedAt: null },
    });
  });
}

async function lockCount(tx: Tx, countId: string) {
  await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = CAST(${countId} AS uuid) FOR UPDATE`;
  const count = await tx.stockCount.findUnique({ where: { id: countId }, include: { lines: true } });
  if (!count) throw new AppError("That stock count was not found.", "NOT_FOUND", 404);
  return count;
}
