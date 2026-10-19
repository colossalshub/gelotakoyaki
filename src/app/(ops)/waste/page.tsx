import { wasteAction } from "@/actions/stock";
import { LineForm } from "@/components/line-form";
import { Banner, PageHeader } from "@/components/ui";
import { WASTE_REASONS } from "@/domain/constants";
import { requireActor } from "@/server/current";
import { activeItems, activeUnits, toClientItem, visibleBranches } from "@/server/lookups";

export default async function WastePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [branches, items, units] = await Promise.all([visibleBranches(actor), activeItems(), activeUnits()]);
  return (
    <>
      <PageHeader
        title="Waste and spoilage"
        lede="Posted waste reduces stock. Recipe yield loss is a separate estimate and should not also be entered here."
      />
      {params.notice ? <Banner tone="ok">Waste posted.</Banner> : null}
      <LineForm
        action={wasteAction}
        items={items.map(toClientItem)}
        units={units.map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))}
        title="Waste lines"
        confirm="Posting removes this quantity from available stock."
        showReason
        reasons={WASTE_REASONS.map((reason) => ({ code: reason.code, label: reason.label }))}
      />
    </>
  );
}
