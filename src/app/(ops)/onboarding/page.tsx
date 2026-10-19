import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function OnboardingPage() {
  await requireActor();
  const [branches, items, openings, recipes, staff] = await Promise.all([
    prisma.branch.count(),
    prisma.item.count(),
    prisma.stockMovement.count({ where: { movementType: "OPENING" } }),
    prisma.recipeRevision.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { role: { not: "OWNER" } } }),
  ]);
  const steps = [
    ["Rename the branches", branches > 0, "/settings/branches"],
    ["Add the real catalog", items > 0, "/settings/catalog"],
    ["Enter opening stock from a physical count", openings > 0, "/opening"],
    ["Add recipes before relying on sales consumption", recipes > 0, "/recipes"],
    ["Add the people who will record stock", staff > 0, "/settings/users"],
  ] as const;
  return (
    <>
      <PageHeader
        title="Setup"
        lede="Nothing here invents stock, suppliers, or sales. Finish these steps with the shop's own records, then start posting real movements."
      />
      <ol className="grid gap-3">
        {steps.map(([label, done, href], index) => (
          <li key={label} className="card flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm text-muted">Step {index + 1}</p>
              <p className="font-medium">{label}</p>
              <p className="text-sm">{done ? "Started" : "Not started"}</p>
            </div>
            <Link className="btn" href={href}>Open</Link>
          </li>
        ))}
      </ol>
    </>
  );
}
