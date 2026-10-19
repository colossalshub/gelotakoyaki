import { DEFAULT_POLICY, STARTER_BRANCHES, STARTER_CATEGORIES, STARTER_UNITS } from "@/domain/constants";
import { prisma } from "@/server/db";

export async function bootstrapReferenceData(): Promise<{
  units: number;
  categories: number;
  branches: number;
}> {
  let units = 0;
  for (const unit of STARTER_UNITS) {
    const existing = await prisma.unit.findUnique({ where: { code: unit.code } });
    if (!existing) {
      await prisma.unit.create({ data: unit });
      units += 1;
    }
  }

  let categories = 0;
  for (const [index, category] of STARTER_CATEGORIES.entries()) {
    const existing = await prisma.category.findUnique({ where: { name: category.name } });
    if (!existing) {
      await prisma.category.create({
        data: { ...category, sortOrder: index },
      });
      categories += 1;
    }
  }

  let branches = 0;
  for (const branch of STARTER_BRANCHES) {
    const existing = await prisma.branch.findUnique({ where: { code: branch.code } });
    if (!existing) {
      await prisma.branch.create({ data: { ...branch, active: true } });
      branches += 1;
    }
  }

  const policy = await prisma.businessSetting.findUnique({ where: { key: "policy" } });
  if (!policy) {
    await prisma.businessSetting.create({
      data: { key: "policy", value: DEFAULT_POLICY },
    });
  }

  return { units, categories, branches };
}
