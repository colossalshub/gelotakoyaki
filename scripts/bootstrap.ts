import { bootstrapReferenceData } from "../src/server/bootstrap";
import { prisma } from "../src/server/db";

async function main() {
  const result = await bootstrapReferenceData();
  console.log(
    `Reference data ready. Added ${result.units} units, ${result.categories} categories, and ${result.branches} branches.`,
  );
  console.log("Starter branches are named Branch 1 and Branch 2. Rename them before recording real stock.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
