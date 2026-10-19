import Link from "next/link";
import { Empty, PageHeader, Pill, QtyText } from "@/components/ui";
import { D } from "@/domain/decimal";
import { requireActor } from "@/server/current";
import { visibleBranchFilter } from "@/server/authz";
import { prisma } from "@/server/db";
import { visibleBranches } from "@/server/lookups";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const branches = await visibleBranches(actor);
  const branchWhere = visibleBranchFilter(actor, params.branch);
  const query = params.q?.trim();
  const items = await prisma.item.findMany({
    where: query
      ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }] }
      : {},
    include: { baseUnit: true, category: true },
    orderBy: { name: "asc" },
  });
  const balances = await prisma.inventoryBalance.findMany({
    where: { ...("branchId" in branchWhere ? { branchId: branchWhere.branchId } : {}), itemId: { in: items.map((item) => item.id) } },
  });
  const branchName = new Map(branches.map((branch) => [branch.id, branch.code]));
  return (
    <>
      <PageHeader
        title="Inventory"
        lede="Balances come from the ledger. A blank balance means the item has not been stocked at that branch."
        action={
          <Link className="btn btn-primary" href="/opening">
            Enter opening stock
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <label className="field min-w-48 flex-1">
          <span>Search</span>
          <input className="control" name="q" defaultValue={query ?? ""} placeholder="Name or SKU" />
        </label>
        <label className="field">
          <span>Branch</span>
          <select className="control" name="branch" defaultValue={params.branch ?? ""}>
            <option value="">All authorised</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn" type="submit">
            Search
          </button>
        </div>
      </form>
      {items.length === 0 ? (
        <Empty title="No items yet" body="Add the real catalog in settings. Nothing here is preloaded as Gelos stock." href="/settings/catalog" label="Add an item" />
      ) : (
        <div className="card table-scroll">
          <table className="data-table">
            <caption className="sr-only">Inventory balances</caption>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Branch balances</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const rows = balances.filter((balance) => balance.itemId === item.id);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/inventory/${item.id}`}>
                        {item.name}
                      </Link>
                      <div className="num text-xs text-muted">{item.sku}</div>
                      {!item.active ? <Pill>Archived</Pill> : null}
                    </td>
                    <td>{item.category.name}</td>
                    <td>
                      {rows.length === 0 ? (
                        <span className="text-muted">Not stocked</span>
                      ) : (
                        rows.map((row) => (
                          <div key={`${row.branchId}`}>
                            {branchName.get(row.branchId) ?? "Branch"} <QtyText value={D(row.quantity)} unit={item.baseUnit.code} />
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
