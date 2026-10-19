import { openingAction } from "@/actions/stock";
import { LineForm } from "@/components/line-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";

export default async function OpeningPage() {
  const actor = await requireActor();
  const [branches, items, units] = await Promise.all([visibleBranches(actor), activeItems(), activeUnits()]);
  return (
    <>
      <PageHeader
        title="Opening stock"
        lede="Use this once for the physical stock you are starting from. If the item already has a balance, confirm that you mean to add more. Do not re-enter the same count as a new opening."
      />
      <LineForm
        action={openingAction}
        items={items.map(toClientItem)}
        units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        title="Opening lines"
        confirm="This posts an opening balance. A later correction should be a reversal or a stock count, not a second silent edit."
        showCost
        extra={
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input name="acknowledgeExisting" type="checkbox" />
            I am adding this on top of stock that is already recorded
          </label>
        }
      />
    </>
  );
}
