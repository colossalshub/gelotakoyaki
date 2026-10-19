import { transferCreateAction } from "@/actions/stock";
import { LineForm } from "@/components/line-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";

export default async function NewTransferPage() {
  const actor = await requireActor();
  const [branches, items, units, allBranches] = await Promise.all([
    visibleBranches(actor),
    activeItems(),
    activeUnits(),
    prisma.branch.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);
  const destinations = actor.role === "OWNER" ? allBranches : allBranches;
  return (
    <>
      <PageHeader title="Request a transfer" lede="Requesting does not move stock. Dispatch does." />
      <LineForm
        action={transferCreateAction}
        items={items.map(toClientItem)}
        units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        title="Items to send"
        confirm="This requests the transfer. Stock stays at the source until someone dispatches it."
        extra={
          <label className="field">
            <span>Destination branch</span>
            <select className="control" name="destBranchId" required defaultValue="">
              <option value="">Choose</option>
              {destinations.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} · {branch.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
    </>
  );
}
