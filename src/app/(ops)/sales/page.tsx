import { saleAction, salesImportAction } from "@/actions/catalog";
import { SaleForm } from "@/components/sale-form";
import { Banner, PageHeader, Pill } from "@/components/ui";
import { requireActor } from "@/server/current";
import { visibleBranches } from "@/server/lookups";
import { prisma } from "@/server/db";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ notice?: string; batch?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [branches, menus, batch] = await Promise.all([
    visibleBranches(actor),
    prisma.menuItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    params.batch
      ? prisma.salesBatch.findUnique({ where: { id: params.batch }, include: { rows: true } })
      : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        title="Sales"
        lede="Posting a sale deducts the recipe that was effective at that time, once. Importing the same external id again does not deduct again."
      />
      {params.notice ? <Banner tone="ok">Sale posted.</Banner> : null}
      <SaleForm
        action={saleAction}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        menus={menus.map((menu) => ({ id: menu.id, sku: menu.sku, name: menu.name }))}
      />
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">CSV import</h2>
        <p className="mb-2 text-sm text-muted">Columns: external_id, sold_at, branch_code, menu_sku, quantity. Optional variant_sku. Times without a zone are read in Asia/Manila.</p>
        <form action={salesImportAction} className="grid max-w-lg gap-3">
          <input className="control" type="file" name="file" accept=".csv,text/csv" required />
          <div className="flex gap-2">
            <button className="btn" name="intent" value="stage" type="submit">Check file</button>
            <button className="btn btn-primary" name="intent" value="post" type="submit">Check and post valid rows</button>
          </div>
        </form>
        {batch ? (
          <div className="card mt-4 table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>External id</th><th>Status</th><th>Message</th></tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{row.externalId}</td>
                    <td><Pill>{row.status}</Pill></td>
                    <td>{row.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
