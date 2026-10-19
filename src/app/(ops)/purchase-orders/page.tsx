import { purchaseOrderAction } from "@/actions/stock";
import { LineForm } from "@/components/line-form";
import { PageHeader, Pill } from "@/components/ui";
import { requireActor } from "@/server/current";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";
import { prisma } from "@/server/db";

export default async function PurchaseOrdersPage() {
  const actor = await requireActor();
  const [branches, items, units, orders, suppliers] = await Promise.all([
    visibleBranches(actor),
    activeItems(),
    activeUnits(),
    prisma.purchaseOrder.findMany({ include: { branch: true, supplier: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.supplier.findMany({ where: { active: true } }),
  ]);
  return (
    <>
      <PageHeader title="Purchase orders" lede="Marking an order as ordered does not add stock. Receive the delivery, including a partial one, from Receive stock." />
      <div className="card mb-6 table-scroll">
        <table className="data-table">
          <thead><tr><th>Number</th><th>Branch</th><th>Status</th></tr></thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}><td>{order.number}</td><td>{order.branch.code}</td><td><Pill>{order.status}</Pill></td></tr>
            ))}
            {orders.length === 0 ? <tr><td colSpan={3}>No purchase orders.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <LineForm
        action={purchaseOrderAction}
        items={items.map(toClientItem)}
        units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        title="Order lines"
        confirm="This marks the purchase order as ordered. Stock changes only when a receipt is posted."
        showCost
        extra={
          <label className="field">
            <span>Supplier</span>
            <select className="control" name="supplierId" defaultValue="">
              <option value="">None</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
        }
      />
    </>
  );
}
