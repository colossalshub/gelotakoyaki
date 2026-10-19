import type { Actor } from "@/domain/permissions";
import { parseCsv } from "@/domain/csv";
import { D, decToDb, Decimal } from "@/domain/decimal";
import { normalizeSku } from "@/domain/password";
import { parseOptionalCost, parseOptionalQty } from "@/domain/qty";
import { dimensionalFactor, unitFromRow } from "@/domain/units";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { prisma } from "@/server/db";
import { AppError, isUniqueViolation } from "@/server/errors";

export type ItemInput = {
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  baseUnitId: string;
  purchaseUnitId: string;
  purchaseToBaseFactor?: string;
  supplierId?: string | null;
  purchaseCost?: string;
  defaultReorderPoint?: string;
  defaultTargetLevel?: string;
  tracksExpiry?: boolean;
  tracksBatch?: boolean;
  storageLocation?: string;
  active?: boolean;
};

export async function saveItem(actor: Actor, input: ItemInput, id?: string) {
  assertCan(actor, "catalog.manage");
  const sku = normalizeSku(input.sku);
  if (!sku || !input.name.trim()) throw new AppError("An item needs a SKU and a name.");
  const [base, purchase] = await Promise.all([
    prisma.unit.findUnique({ where: { id: input.baseUnitId } }),
    prisma.unit.findUnique({ where: { id: input.purchaseUnitId } }),
  ]);
  if (!base || !purchase) throw new AppError("Choose the base unit and the purchase unit.");
  const derived = dimensionalFactor(unitFromRow(base), unitFromRow(base));
  void derived;
  const factorFromUnits = dimensionalFactor(unitFromRow(purchase), unitFromRow(base));
  const factor = factorFromUnits ?? (input.purchaseToBaseFactor ? new Decimal(input.purchaseToBaseFactor) : null);
  if (!factor || factor.lte(0)) {
    throw new AppError(
      "These units are not in the same family. Enter an explicit conversion factor. The system will not assume that one litre weighs one kilogram.",
    );
  }
  const data = {
    sku,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    categoryId: input.categoryId,
    baseUnitId: input.baseUnitId,
    purchaseUnitId: input.purchaseUnitId,
    purchaseToBaseFactor: decToDb(factor),
    supplierId: input.supplierId || null,
    purchaseCost: input.purchaseCost ? decToDb(parseOptionalCost(input.purchaseCost) ?? new Decimal(0), 4) : null,
    defaultReorderPoint: decToDb(parseOptionalQty(input.defaultReorderPoint)),
    defaultTargetLevel: decToDb(parseOptionalQty(input.defaultTargetLevel)),
    tracksExpiry: Boolean(input.tracksExpiry),
    tracksBatch: Boolean(input.tracksBatch),
    storageLocation: input.storageLocation?.trim() || null,
    active: input.active ?? true,
  };
  try {
    const item = id
      ? await prisma.item.update({ where: { id }, data })
      : await prisma.item.create({ data });
    await audit(prisma, {
      userId: actor.id,
      action: id ? "item.update" : "item.create",
      entityType: "item",
      entityId: item.id,
    });
    return item;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("That SKU is already in use.");
    throw error;
  }
}

export async function saveBranchStocking(
  actor: Actor,
  input: { branchId: string; itemId: string; reorderPoint: string; targetLevel: string; storageLocation?: string },
) {
  assertCan(actor, "inventory.configure", input.branchId);
  return prisma.branchItem.upsert({
    where: { branchId_itemId: { branchId: input.branchId, itemId: input.itemId } },
    create: {
      branchId: input.branchId,
      itemId: input.itemId,
      reorderPoint: decToDb(parseOptionalQty(input.reorderPoint)),
      targetLevel: decToDb(parseOptionalQty(input.targetLevel)),
      storageLocation: input.storageLocation?.trim() || null,
    },
    update: {
      reorderPoint: decToDb(parseOptionalQty(input.reorderPoint)),
      targetLevel: decToDb(parseOptionalQty(input.targetLevel)),
      storageLocation: input.storageLocation?.trim() || null,
    },
  });
}

export async function importCatalogCsv(actor: Actor, csv: string) {
  assertCan(actor, "catalog.manage");
  const table = parseCsv(csv);
  if (table.length < 2) throw new AppError("The file needs a header and at least one row.");
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  for (const column of ["sku", "name", "category", "base_unit"]) {
    if (index[column] === undefined) throw new AppError(`The file is missing a ${column} column.`);
  }
  const [categories, units] = await Promise.all([prisma.category.findMany(), prisma.unit.findMany()]);
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const [rowNumber, row] of table.slice(1).entries()) {
    try {
      const sku = normalizeSku(row[index.sku] ?? "");
      const name = (row[index.name] ?? "").trim();
      const category = categories.find((entry) => entry.name.toLowerCase() === (row[index.category] ?? "").trim().toLowerCase());
      const base = units.find((entry) => entry.code.toLowerCase() === (row[index.base_unit] ?? "").trim().toLowerCase());
      const purchaseCode = index.purchase_unit === undefined ? "" : (row[index.purchase_unit] ?? "").trim();
      const purchase = units.find((entry) => entry.code.toLowerCase() === (purchaseCode || base?.code || "").toLowerCase());
      if (!sku || !name || !category || !base || !purchase) {
        throw new AppError("SKU, name, category, and units must match the catalog setup.");
      }
      const existing = await prisma.item.findUnique({ where: { sku } });
      await saveItem(
        actor,
        {
          sku,
          name,
          description: index.description === undefined ? undefined : row[index.description],
          categoryId: category.id,
          baseUnitId: base.id,
          purchaseUnitId: purchase.id,
          purchaseToBaseFactor: index.conversion_factor === undefined ? undefined : row[index.conversion_factor],
          purchaseCost: index.purchase_cost === undefined ? undefined : row[index.purchase_cost],
          defaultReorderPoint: index.reorder_point === undefined ? undefined : row[index.reorder_point],
          defaultTargetLevel: index.target_level === undefined ? undefined : row[index.target_level],
        },
        existing?.id,
      );
      if (existing) updated += 1;
      else created += 1;
    } catch (error) {
      errors.push(`Row ${rowNumber + 2}: ${error instanceof Error ? error.message : "Could not import."}`);
    }
  }
  return { created, updated, errors };
}

export async function saveCategory(actor: Actor, input: { id?: string; name: string; description?: string; active?: boolean }) {
  assertCan(actor, "catalog.manage");
  if (!input.name.trim()) throw new AppError("A category needs a name.");
  if (input.id) {
    return prisma.category.update({
      where: { id: input.id },
      data: { name: input.name.trim(), description: input.description?.trim() || null, active: input.active ?? true },
    });
  }
  const count = await prisma.category.count();
  return prisma.category.create({
    data: { name: input.name.trim(), description: input.description?.trim() || null, sortOrder: count },
  });
}

export async function saveSupplier(actor: Actor, input: { id?: string; name: string; contact?: string; notes?: string; active?: boolean }) {
  assertCan(actor, "catalog.manage");
  if (!input.name.trim()) throw new AppError("A supplier needs a name.");
  const data = {
    name: input.name.trim(),
    contact: input.contact?.trim() || null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };
  return input.id ? prisma.supplier.update({ where: { id: input.id }, data }) : prisma.supplier.create({ data });
}

export async function saveBranch(actor: Actor, input: { id?: string; code: string; name: string; notes?: string; active?: boolean }) {
  assertCan(actor, "branches.manage");
  const code = normalizeSku(input.code);
  if (!code || !input.name.trim()) throw new AppError("A branch needs a code and a name.");
  const data = { code, name: input.name.trim(), notes: input.notes?.trim() || null, active: input.active ?? true };
  try {
    return input.id
      ? await prisma.branch.update({ where: { id: input.id }, data })
      : await prisma.branch.create({ data });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("That branch code is already in use.");
    throw error;
  }
}

void D;
