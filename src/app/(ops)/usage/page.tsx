import { usageAction } from "@/actions/stock";
import { LineForm } from "@/components/line-form";
import { Banner, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [branches, items, units] = await Promise.all([visibleBranches(actor), activeItems(), activeUnits()]);
  return (
    <>
      <PageHeader
        title="Record usage"
        lede="This is actual ingredient usage. It is separate from theoretical consumption calculated from sales. Do not record both for the same production or the stock will be reduced twice."
      />
      {params.notice ? <Banner tone="ok">Usage posted.</Banner> : null}
      <LineForm
        action={usageAction}
        items={items.map(toClientItem)}
        units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        title="Usage lines"
        confirm="Posting reduces available stock at this branch."
        extra={
          <label className="field">
            <span>Kind</span>
            <select className="control" name="kind" defaultValue="ACTUAL">
              <option value="ACTUAL">Actual usage</option>
              <option value="RETURN">Return to stock</option>
            </select>
          </label>
        }
      />
    </>
  );
}
