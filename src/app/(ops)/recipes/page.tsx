import Link from "next/link";
import { menuAction } from "@/actions/catalog";
import { LineForm } from "@/components/line-form";
import { Banner, PageHeader } from "@/components/ui";
import { formatQty } from "@/domain/format";
import { D } from "@/domain/decimal";
import { requireActor } from "@/server/current";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";
import { prisma } from "@/server/db";

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [items, units, branches, menus] = await Promise.all([
    activeItems(),
    activeUnits(),
    visibleBranches(actor),
    prisma.menuItem.findMany({
      where: { active: true },
      include: { revisions: { where: { status: "ACTIVE" }, include: { lines: { include: { item: true, unit: true } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Recipes and sales"
        lede="Recipe quantities are configuration, not a claim about Gelos Takoyaki's real formula. Theoretical consumption is posted only from recorded sales."
        action={<Link className="btn" href="/sales">Enter or import sales</Link>}
      />
      {params.notice ? <Banner tone="ok">Saved.</Banner> : null}
      <div className="grid gap-4">
        {menus.map((menu) => (
          <article key={menu.id} className="card p-4">
            <h2 className="font-semibold">{menu.name}</h2>
            <p className="num text-sm text-muted">{menu.sku}</p>
            {menu.revisions[0] ? (
              <ul className="mt-2 text-sm">
                {menu.revisions[0].lines.map((line) => (
                  <li key={line.id}>
                    {line.item.name}: {formatQty(D(line.quantityPerUnit))} {line.unit.code} per serving
                    {D(line.yieldFactor).eq(1) ? "" : ` · yield ${formatQty(D(line.yieldFactor))}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No active recipe. Sales of this item will be refused until one is effective.</p>
            )}
          </article>
        ))}
      </div>
      {actor.role === "OWNER" ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Add a menu item and recipe</h2>
          <LineForm
            action={menuAction}
            items={items.map(toClientItem)}
            units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
            branches={branches.length ? branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name })) : [{ id: "unused", code: "—", name: "Recipe is not branch-specific" }]}
            title="Ingredients per serving"
            confirm="Saving activates this recipe from now. It does not change past sales."
            extra={
              <>
                <label className="field"><span>Menu SKU</span><input className="control" name="sku" required /></label>
                <label className="field"><span>Menu name</span><input className="control" name="name" required /></label>
                <p className="text-sm text-muted">The branch field is ignored for recipes. Pick any branch to continue.</p>
              </>
            }
          />
        </section>
      ) : null}
    </>
  );
}
