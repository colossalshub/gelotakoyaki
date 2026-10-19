import { receiptAction } from "@/actions/stock";
import { LineForm } from "@/components/line-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";
import { prisma } from "@/server/db";

export default async function NewReceiptPage() {
  const actor = await requireActor();
  const [branches, items, units, suppliers] = await Promise.all([
    visibleBranches(actor),
    activeItems(),
    activeUnits(),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="New receipt"
        lede="Enter the delivered quantity. Damaged and rejected amounts do not enter stock. Leave cost blank only if it is truly unknown."
      />
      <LineForm
        action={receiptAction}
        items={items.map(toClientItem)}
        units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        title="Lines"
        confirm="Posting adds the accepted quantity to the branch ledger. You can reverse it later, but the original receipt remains."
        showCost
        showDamage
        showLot
        extra={
          <>
            <label className="field">
              <span>Supplier</span>
              <select className="control" name="supplierId" defaultValue="">
                <option value="">None</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Invoice or receipt reference</span>
              <input className="control" name="invoiceRef" />
            </label>
          </>
        }
      />
    </>
  );
}
