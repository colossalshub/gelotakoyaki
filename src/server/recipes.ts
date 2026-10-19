import type { Actor } from "@/domain/permissions";
import { D, decToDb, Decimal } from "@/domain/decimal";
import { theoreticalConsumption } from "@/domain/inventory-math";
import { normalizeSku } from "@/domain/password";
import { parseQty } from "@/domain/qty";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { convertItemQuantity, loadUnitMap, requireItem } from "@/server/convert";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { postMovement } from "@/server/ledger";
import { nextNumber } from "@/server/sequences";

export async function createMenuItem(
  actor: Actor,
  input: { sku: string; name: string; description?: string },
) {
  assertCan(actor, "recipes.manage");
  const sku = normalizeSku(input.sku);
  if (!sku || !input.name.trim()) throw new AppError("A menu item needs a SKU and a name.");
  return prisma.menuItem.create({
    data: { sku, name: input.name.trim(), description: input.description?.trim() || null },
  });
}

export async function createMenuVariant(actor: Actor, input: { menuItemId: string; sku: string; name: string }) {
  assertCan(actor, "recipes.manage");
  return prisma.menuVariant.create({
    data: { menuItemId: input.menuItemId, sku: normalizeSku(input.sku), name: input.name.trim() },
  });
}

export async function saveRecipeRevision(
  actor: Actor,
  input: {
    menuItemId: string;
    variantId?: string | null;
    effectiveFrom: Date;
    notes?: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string; yieldFactor?: string; notes?: string }>;
  },
) {
  assertCan(actor, "recipes.manage");
  if (!input.lines.length) throw new AppError("A recipe needs at least one ingredient.");
  return prisma.$transaction(async (tx) => {
    const units = await loadUnitMap(tx);
    const prepared = [];
    for (const line of input.lines) {
      const item = await requireItem(tx, line.itemId);
      const quantity = parseQty(line.quantity);
      convertItemQuantity(item, units, line.unitId, quantity);
      const yieldFactor = line.yieldFactor ? new Decimal(line.yieldFactor) : new Decimal(1);
      if (yieldFactor.lte(0) || yieldFactor.gt(1)) {
        throw new AppError("Yield must be greater than 0 and at most 1. Use 1 when there is no extra preparation loss.");
      }
      prepared.push({ item, quantity, unitId: line.unitId, yieldFactor, notes: line.notes?.trim() || null });
    }
    const variantId = input.variantId || null;
    const existing = await tx.recipeRevision.findMany({
      where: { menuItemId: input.menuItemId, variantId },
      orderBy: { version: "desc" },
      take: 1,
    });
    const version = (existing[0]?.version ?? 0) + 1;
    const revision = await tx.recipeRevision.create({
      data: {
        menuItemId: input.menuItemId,
        variantId,
        version,
        effectiveFrom: input.effectiveFrom,
        notes: input.notes ?? null,
        createdById: actor.id,
        status: "DRAFT",
        lines: {
          create: prepared.map((line) => ({
            itemId: line.item.id,
            quantityPerUnit: decToDb(line.quantity),
            unitId: line.unitId,
            yieldFactor: decToDb(line.yieldFactor),
            notes: line.notes,
          })),
        },
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "recipe.save",
      entityType: "recipe_revision",
      entityId: revision.id,
    });
    return revision;
  });
}

export async function activateRecipeRevision(actor: Actor, revisionId: string) {
  assertCan(actor, "recipes.manage");
  return prisma.$transaction(async (tx) => {
    const revision = await tx.recipeRevision.findUnique({ where: { id: revisionId } });
    if (!revision) throw new AppError("That recipe revision was not found.", "NOT_FOUND", 404);
    if (revision.status === "ACTIVE") return revision;
    const current = await tx.recipeRevision.findFirst({
      where: { menuItemId: revision.menuItemId, variantId: revision.variantId, status: "ACTIVE" },
    });
    if (current && current.id !== revision.id) {
      await tx.recipeRevision.update({
        where: { id: current.id },
        data: { status: "SUPERSEDED", effectiveTo: revision.effectiveFrom },
      });
    }
    return tx.recipeRevision.update({ where: { id: revision.id }, data: { status: "ACTIVE" } });
  });
}

export async function findEffectiveRevision(
  tx: Tx,
  menuItemId: string,
  variantId: string | null,
  soldAt: Date,
) {
  const revisions = await tx.recipeRevision.findMany({
    where: {
      menuItemId,
      variantId,
      status: { in: ["ACTIVE", "SUPERSEDED"] },
      effectiveFrom: { lte: soldAt },
    },
    include: { lines: { include: { item: { include: { baseUnit: true, purchaseUnit: true } }, unit: true } } },
    orderBy: { effectiveFrom: "desc" },
  });
  return revisions.find((revision) => !revision.effectiveTo || revision.effectiveTo > soldAt) ?? null;
}

export async function consumptionForSale(
  tx: Tx,
  input: { menuItemId: string; variantId: string | null; quantity: Decimal; soldAt: Date },
) {
  const revision = await findEffectiveRevision(tx, input.menuItemId, input.variantId, input.soldAt);
  if (!revision) return null;
  const units = await loadUnitMap(tx);
  const totals = new Map<string, { itemId: string; baseUnitId: string; quantity: Decimal }>();
  for (const line of revision.lines) {
    const perBase = convertItemQuantity(line.item, units, line.unitId, D(line.quantityPerUnit));
    const gross = theoreticalConsumption(input.quantity, perBase, D(line.yieldFactor));
    const current = totals.get(line.itemId);
    if (current) current.quantity = current.quantity.plus(gross);
    else totals.set(line.itemId, { itemId: line.itemId, baseUnitId: line.item.baseUnitId, quantity: gross });
  }
  return { revision, lines: [...totals.values()] };
}

export async function savePreparationRecipe(
  actor: Actor,
  input: {
    name: string;
    outputItemId: string;
    outputQuantity: string;
    outputUnitId: string;
    notes?: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string; yieldFactor?: string }>;
  },
) {
  assertCan(actor, "recipes.manage");
  const output = await prisma.item.findUnique({ where: { id: input.outputItemId } });
  if (!output) throw new AppError("The prepared item was not found.", "NOT_FOUND", 404);
  if (input.lines.some((line) => line.itemId === input.outputItemId)) {
    throw new AppError("A preparation recipe cannot use its own output as an ingredient.");
  }
  return prisma.preparationRecipe.create({
    data: {
      name: input.name.trim(),
      outputItemId: input.outputItemId,
      outputQuantity: decToDb(parseQty(input.outputQuantity)),
      outputUnitId: input.outputUnitId,
      notes: input.notes ?? null,
      lines: {
        create: input.lines.map((line) => ({
          itemId: line.itemId,
          quantity: decToDb(parseQty(line.quantity)),
          unitId: line.unitId,
          yieldFactor: decToDb(line.yieldFactor ? new Decimal(line.yieldFactor) : new Decimal(1)),
        })),
      },
    },
  });
}

export async function postPreparation(
  actor: Actor,
  input: { branchId: string; recipeId: string; batchesMade: string; occurredAt?: Date; notes?: string; idempotencyKey: string },
) {
  assertCan(actor, "inventory.usage", input.branchId);
  const batchesMade = parseQty(input.batchesMade);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.preparationBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const recipe = await tx.preparationRecipe.findUnique({
      where: { id: input.recipeId },
      include: { lines: true, outputItem: true },
    });
    if (!recipe || !recipe.active) throw new AppError("That preparation recipe was not found.", "NOT_FOUND", 404);
    const units = await loadUnitMap(tx);
    const outputItem = await requireItem(tx, recipe.outputItemId);
    const outputBase = convertItemQuantity(outputItem, units, recipe.outputUnitId, D(recipe.outputQuantity).mul(batchesMade));
    const doc = await tx.preparationBatch.create({
      data: {
        number: await nextNumber(tx, "PRP"),
        branchId: input.branchId,
        recipeId: recipe.id,
        batchesMade: decToDb(batchesMade),
        occurredAt: input.occurredAt ?? new Date(),
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        createdById: actor.id,
        outputUnitId: recipe.outputUnitId,
      },
    });
    for (const line of recipe.lines) {
      const item = await requireItem(tx, line.itemId, true);
      const per = D(line.quantity).mul(batchesMade);
      const gross = theoreticalConsumption(new Decimal(1), per, D(line.yieldFactor));
      const base = convertItemQuantity(item, units, line.unitId, gross);
      await postMovement(
        {
          branchId: input.branchId,
          itemId: item.id,
          quantityDelta: base.neg(),
          unitId: item.baseUnitId,
          movementType: "ACTUAL_USAGE",
          occurredAt: input.occurredAt,
          userId: actor.id,
          referenceType: "PREPARATION",
          referenceId: doc.id,
          idempotencyKey: `prep:${doc.id}:in:${line.id}`,
          notes: recipe.name,
        },
        tx,
      );
    }
    await postMovement(
      {
        branchId: input.branchId,
        itemId: outputItem.id,
        quantityDelta: outputBase,
        unitId: outputItem.baseUnitId,
        movementType: "PRODUCTION",
        occurredAt: input.occurredAt,
        userId: actor.id,
        referenceType: "PREPARATION",
        referenceId: doc.id,
        idempotencyKey: `prep:${doc.id}:out`,
        notes: recipe.name,
      },
      tx,
    );
    return tx.preparationBatch.update({
      where: { id: doc.id },
      data: { status: "POSTED", postedAt: new Date(), postedById: actor.id },
    });
  });
}
