import bcrypt from "bcryptjs";
import type { BranchAccess, Actor } from "@/domain/permissions";
import { prisma } from "@/server/db";
import { bootstrapReferenceData } from "@/server/bootstrap";
import { toActor } from "@/server/auth";

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_events,
      sale_import_rows,
      sales_batches,
      sales,
      recipe_lines,
      recipe_revisions,
      menu_variants,
      menu_items,
      preparation_lines,
      preparation_batches,
      preparation_recipes,
      usage_lines,
      usage_records,
      waste_lines,
      waste_records,
      stock_count_lines,
      stock_counts,
      transfer_receipts,
      stock_transfer_lines,
      stock_transfers,
      opening_lines,
      opening_documents,
      supplier_return_lines,
      supplier_returns,
      goods_receipt_lines,
      goods_receipts,
      purchase_order_lines,
      purchase_orders,
      stock_movements,
      item_batches,
      branch_item_costs,
      inventory_balances,
      branch_items,
      items,
      suppliers,
      user_branches,
      sessions,
      login_attempts,
      users,
      branches,
      categories,
      units,
      business_settings,
      number_sequences
    RESTART IDENTITY CASCADE
  `);
  await bootstrapReferenceData();
}

export async function makeUser(input: {
  email: string;
  name: string;
  role: Actor["role"];
  branches?: BranchAccess[];
}): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await bcrypt.hash("test-password-123", 4),
      branches: input.branches?.length ? { create: input.branches } : undefined,
    },
    include: { branches: true },
  });
  return toActor(user);
}

export async function branchByCode(code: string) {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { code } });
  return branch;
}

export async function unitByCode(code: string) {
  return prisma.unit.findUniqueOrThrow({ where: { code } });
}

export async function createItem(input: {
  sku: string;
  base?: string;
  purchase?: string;
  factor?: string;
  reorder?: string;
  target?: string;
}) {
  const category = await prisma.category.findFirstOrThrow();
  const baseCode = input.base ?? "pc";
  const base = await unitByCode(baseCode);
  const purchase = await unitByCode(input.purchase ?? baseCode);
  return prisma.item.create({
    data: {
      sku: input.sku,
      name: input.sku,
      categoryId: category.id,
      baseUnitId: base.id,
      purchaseUnitId: purchase.id,
      purchaseToBaseFactor: input.factor ?? "1",
      defaultReorderPoint: input.reorder ?? "0",
      defaultTargetLevel: input.target ?? "0",
    },
  });
}
