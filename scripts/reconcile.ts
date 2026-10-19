import { prisma } from "../src/server/db";
import { reconcileItem } from "../src/server/ledger";

async function main() {
  const balances = await prisma.inventoryBalance.findMany();
  let mismatches = 0;
  for (const balance of balances) {
    const result = await reconcileItem(balance.branchId, balance.itemId);
    if (!result.ok) {
      mismatches += 1;
      console.error(
        `Mismatch branch ${balance.branchId} item ${balance.itemId}: ledger ${result.ledger.toFixed()} cache ${result.balance.toFixed()} cost qty ${result.costQty.toFixed()}`,
      );
    }
  }
  if (mismatches === 0) {
    console.log(`Checked ${balances.length} balance rows. Ledger, cache, and cost quantity agree.`);
    return;
  }
  console.error(`${mismatches} balance rows do not reconcile.`);
  process.exit(1);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
