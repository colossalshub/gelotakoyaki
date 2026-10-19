import { DEFAULT_POLICY, type InventoryPolicy } from "@/domain/constants";
import { prisma, type Tx } from "@/server/db";

export async function getPolicy(tx: Tx = prisma): Promise<InventoryPolicy> {
  const row = await tx.businessSetting.findUnique({ where: { key: "policy" } });
  if (!row || typeof row.value !== "object" || row.value === null || Array.isArray(row.value)) {
    return { ...DEFAULT_POLICY };
  }
  return { ...DEFAULT_POLICY, ...(row.value as Partial<InventoryPolicy>) };
}

export async function savePolicy(tx: Tx, policy: InventoryPolicy): Promise<void> {
  await tx.businessSetting.upsert({
    where: { key: "policy" },
    create: { key: "policy", value: policy },
    update: { value: policy },
  });
}
