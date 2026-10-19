import type { Actor } from "@/domain/permissions";
import { decToDb } from "@/domain/decimal";
import { parseOptionalCost, parseQty } from "@/domain/qty";
import { assertCan } from "@/server/authz";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { nextNumber } from "@/server/sequences";

export async function createPurchaseOrder(
  actor: Actor,
  input: {
    branchId: string;
    supplierId?: string | null;
    notes?: string;
    lines: Array<{ itemId: string; quantity: string; unitId: string; unitCost?: string }>;
  },
) {
  assertCan(actor, "po.manage", input.branchId);
  if (!input.lines.length) throw new AppError("Add at least one line to the purchase order.");
  return prisma.purchaseOrder.create({
    data: {
      number: await prisma.$transaction((tx) => nextNumber(tx, "PO")),
      branchId: input.branchId,
      supplierId: input.supplierId || null,
      notes: input.notes ?? null,
      createdById: actor.id,
      lines: {
        create: input.lines.map((line) => ({
          itemId: line.itemId,
          orderedQty: decToDb(parseQty(line.quantity)),
          unitId: line.unitId,
          unitCost: line.unitCost ? decToDb(parseOptionalCost(line.unitCost) ?? parseQty("0")) : null,
        })),
      },
    },
  });
}

export async function markPurchaseOrderOrdered(actor: Actor, orderId: string) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("That purchase order was not found.", "NOT_FOUND", 404);
  assertCan(actor, "po.manage", order.branchId);
  if (order.status !== "DRAFT") return order;
  return prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "ORDERED" } });
}
