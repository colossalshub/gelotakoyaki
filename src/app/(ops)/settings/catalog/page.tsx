import { catalogImportAction, itemAction } from "@/actions/catalog";
import { ItemForm } from "@/components/item-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [items, categories, units, suppliers] = await Promise.all([
    prisma.item.findMany({ include: { category: true, baseUnit: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.unit.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Catalog" lede="Items are shared by both branches. Balances are not. Importing a catalog does not create stock." />
      {params.notice ? <p className="banner banner-ok mb-3">Saved.</p> : null}
      <div className="card table-scroll mb-6">
        <table className="data-table">
          <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Unit</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="num">{item.sku}</td>
                <td>{item.name}{item.active ? "" : " (archived)"}</td>
                <td>{item.category.name}</td>
                <td>{item.baseUnit.code}</td>
              </tr>
            ))}
            {items.length === 0 ? <tr><td colSpan={4}>No items yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {actor.role === "OWNER" ? (
        <>
          <h2 className="mb-2 font-semibold">New item</h2>
          <ItemForm
            action={itemAction}
            categories={categories.map((category) => ({ id: category.id, name: category.name }))}
            units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
            suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          />
          <h2 className="mb-2 mt-8 font-semibold">Import items</h2>
          <p className="mb-2 text-sm text-muted">Headers: sku, name, category, base_unit, purchase_unit, conversion_factor, reorder_point, target_level, purchase_cost, description. This updates the catalog only.</p>
          <form action={catalogImportAction} className="grid max-w-lg gap-2">
            <input className="control" type="file" name="file" accept=".csv,text/csv" required />
            <button className="btn" type="submit">Import catalog</button>
          </form>
        </>
      ) : null}
    </>
  );
}
