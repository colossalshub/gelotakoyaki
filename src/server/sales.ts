import type { Actor } from "@/domain/permissions";
import { parseCsv } from "@/domain/csv";
import { parseBusinessDateTime } from "@/domain/dates";
import { D, decToDb, Decimal } from "@/domain/decimal";
import { normalizeSku } from "@/domain/password";
import { parseQty } from "@/domain/qty";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/authz";
import { prisma, type Tx } from "@/server/db";
import { AppError, isUniqueViolation } from "@/server/errors";
import { postMovement } from "@/server/ledger";
import { consumptionForSale } from "@/server/recipes";
import { getPolicy } from "@/server/settings";

export async function postSale(
  actor: Actor,
  input: {
    branchId: string;
    menuItemId: string;
    variantId?: string | null;
    quantity: string;
    soldAt: Date;
    source: string;
    externalId: string;
  },
) {
  assertCan(actor, "sales.manage", input.branchId);
  const quantity = parseQty(input.quantity);
  try {
    return await prisma.$transaction((tx) => postSaleTx(tx, actor, { ...input, quantity }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.sale.findUnique({
        where: { source_externalId: { source: input.source, externalId: input.externalId } },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

async function postSaleTx(
  tx: Tx,
  actor: Actor,
  input: {
    branchId: string;
    menuItemId: string;
    variantId?: string | null;
    quantity: Decimal;
    soldAt: Date;
    source: string;
    externalId: string;
  },
) {
  const existing = await tx.sale.findUnique({
    where: { source_externalId: { source: input.source, externalId: input.externalId } },
  });
  if (existing) return existing;
  const consumption = await consumptionForSale(tx, {
    menuItemId: input.menuItemId,
    variantId: input.variantId ?? null,
    quantity: input.quantity,
    soldAt: input.soldAt,
  });
  if (!consumption) {
    throw new AppError(
      "No recipe revision is effective on that sale date. Theoretical consumption was not posted.",
      "NO_RECIPE",
    );
  }
  const sale = await tx.sale.create({
    data: {
      branchId: input.branchId,
      menuItemId: input.menuItemId,
      variantId: input.variantId ?? null,
      recipeRevisionId: consumption.revision.id,
      quantity: decToDb(input.quantity),
      soldAt: input.soldAt,
      source: input.source,
      externalId: input.externalId,
      createdById: actor.id,
    },
  });
  for (const line of consumption.lines) {
    if (line.quantity.isZero()) continue;
    await postMovement(
      {
        branchId: input.branchId,
        itemId: line.itemId,
        quantityDelta: line.quantity.neg(),
        unitId: line.baseUnitId,
        movementType: "SALE_CONSUMPTION",
        occurredAt: input.soldAt,
        userId: actor.id,
        referenceType: "SALE",
        referenceId: sale.id,
        idempotencyKey: `sale:${sale.id}:${line.itemId}`,
        sourceRef: `${input.source}:${input.externalId}`,
        notes: "Theoretical consumption from the recipe effective on the sale date. This is not recorded actual usage.",
      },
      tx,
    );
  }
  await audit(tx, {
    userId: actor.id,
    action: "sale.post",
    entityType: "sale",
    entityId: sale.id,
    branchId: input.branchId,
    metadata: { source: input.source, externalId: input.externalId },
  });
  return sale;
}

export async function stageSalesCsv(actor: Actor, csv: string, fileName?: string) {
  if (actor.role !== "OWNER" && actor.role !== "BRANCH_MANAGER" && !actor.branches.some((branch) => branch.canRecordSales)) {
    throw new AppError("You do not have permission to do that.", "FORBIDDEN", 403);
  }
  if (csv.length > 1_000_000) throw new AppError("That file is too large. Split it under 1 MB.");
  const table = parseCsv(csv);
  if (table.length < 2) throw new AppError("The file needs a header and at least one row.");
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const required = ["external_id", "sold_at", "branch_code", "menu_sku", "quantity"];
  for (const column of required) {
    if (!header.includes(column)) throw new AppError(`The file is missing a ${column} column.`);
  }
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const policy = await getPolicy();
  return prisma.$transaction(async (tx) => {
    const batch = await tx.salesBatch.create({
      data: { source: "CSV", fileName: fileName ?? null, createdById: actor.id },
    });
    const seen = new Set<string>();
    for (const raw of table.slice(1)) {
      const externalId = cell(raw, index.external_id);
      const soldAtRaw = cell(raw, index.sold_at);
      const branchCode = cell(raw, index.branch_code).toUpperCase();
      const menuSku = normalizeSku(cell(raw, index.menu_sku));
      const variantSku = index.variant_sku === undefined ? "" : cell(raw, index.variant_sku);
      const quantityRaw = cell(raw, index.quantity);
      let status: "VALID" | "FLAGGED" = "VALID";
      let message: string | null = null;
      if (!externalId) {
        status = "FLAGGED";
        message = "Missing external id.";
      } else if (seen.has(externalId)) {
        status = "FLAGGED";
        message = "Duplicate external id in this file.";
      } else {
        seen.add(externalId);
        const duplicate = await tx.sale.findUnique({
          where: { source_externalId: { source: "CSV", externalId } },
        });
        if (duplicate) {
          status = "FLAGGED";
          message = "This sale was already imported. It will not deduct inventory again.";
        }
      }
      const branch = branchCode
        ? await tx.branch.findUnique({ where: { code: branchCode } })
        : null;
      if (status === "VALID" && !branch) {
        status = "FLAGGED";
        message = `Unknown branch code ${branchCode || "(blank)"}.`;
      } else if (status === "VALID" && branch && actor.role !== "OWNER" && !actor.branches.some((entry) => entry.branchId === branch.id)) {
        status = "FLAGGED";
        message = "You cannot import sales for that branch.";
      }
      const menu = menuSku ? await tx.menuItem.findUnique({ where: { sku: menuSku } }) : null;
      if (status === "VALID" && !menu) {
        status = "FLAGGED";
        message = `No menu item matches SKU ${menuSku || "(blank)"}.`;
      }
      let variantId: string | null = null;
      if (status === "VALID" && variantSku) {
        const variant = await tx.menuVariant.findUnique({ where: { sku: normalizeSku(variantSku) } });
        if (!variant || variant.menuItemId !== menu?.id) {
          status = "FLAGGED";
          message = `No variant matches SKU ${variantSku}.`;
        } else variantId = variant.id;
      }
      if (status === "VALID") {
        try {
          parseQty(quantityRaw);
          parseBusinessDateTime(soldAtRaw, policy.timezone);
        } catch (error) {
          status = "FLAGGED";
          message = error instanceof Error ? error.message : "Invalid quantity or date.";
        }
      }
      if (status === "VALID" && menu && branch) {
        const { consumptionForSale: consume } = await import("@/server/recipes");
        const soldAt = parseBusinessDateTime(soldAtRaw, policy.timezone);
        const plan = await consume(tx, {
          menuItemId: menu.id,
          variantId,
          quantity: parseQty(quantityRaw),
          soldAt,
        });
        if (!plan) {
          status = "FLAGGED";
          message = "No recipe revision is effective on that sale date.";
        }
      }
      await tx.saleImportRow.create({
        data: {
          batchId: batch.id,
          externalId: externalId || `missing-${crypto.randomUUID()}`,
          soldAtRaw,
          branchCode,
          menuSku,
          variantSku: variantSku || null,
          quantityRaw,
          status: status === "FLAGGED" && message?.includes("already imported") ? "SKIPPED_DUPLICATE" : status,
          message,
        },
      });
    }
    return tx.salesBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { rows: true } });
  });
}

export async function postSalesBatch(actor: Actor, batchId: string) {
  const batch = await prisma.salesBatch.findUnique({ where: { id: batchId }, include: { rows: true } });
  if (!batch) throw new AppError("That import was not found.", "NOT_FOUND", 404);
  const policy = await getPolicy();
  for (const row of batch.rows) {
    if (row.status !== "VALID") continue;
    const branch = await prisma.branch.findUnique({ where: { code: row.branchCode } });
    const menu = await prisma.menuItem.findUnique({ where: { sku: row.menuSku } });
    if (!branch || !menu) continue;
    assertCan(actor, "sales.manage", branch.id);
    const variant = row.variantSku
      ? await prisma.menuVariant.findUnique({ where: { sku: normalizeSku(row.variantSku) } })
      : null;
    try {
      const sale = await postSale(actor, {
        branchId: branch.id,
        menuItemId: menu.id,
        variantId: variant?.id ?? null,
        quantity: row.quantityRaw,
        soldAt: parseBusinessDateTime(row.soldAtRaw, policy.timezone),
        source: "CSV",
        externalId: row.externalId,
      });
      await prisma.saleImportRow.update({
        where: { id: row.id },
        data: { status: "POSTED", saleId: sale.id, message: null },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        await prisma.saleImportRow.update({
          where: { id: row.id },
          data: { status: "SKIPPED_DUPLICATE", message: "Already imported. Inventory was not deducted again." },
        });
        continue;
      }
      throw error;
    }
  }
  return prisma.salesBatch.update({
    where: { id: batch.id },
    data: { status: "POSTED", postedAt: new Date() },
    include: { rows: true },
  });
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (row[index] ?? "").trim();
}

export function recipeConsumptionPreview(sold: Decimal, perBase: Decimal, yieldFactor: Decimal): Decimal {
  return theoreticalConsumptionSafe(sold, perBase, yieldFactor);
}

function theoreticalConsumptionSafe(sold: Decimal, perBase: Decimal, yieldFactor: Decimal): Decimal {
  return sold.mul(perBase).div(yieldFactor);
}

void D;
