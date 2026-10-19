import { Prisma } from "@prisma/client";
import type { Tx } from "@/server/db";

export async function audit(
  tx: Tx,
  event: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    branchId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      userId: event.userId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      branchId: event.branchId ?? null,
      metadata: event.metadata ?? Prisma.JsonNull,
    },
  });
}
