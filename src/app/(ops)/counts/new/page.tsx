import { countCreateAction } from "@/actions/stock";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { activeItems, visibleBranches } from "@/server/lookups";

export default async function NewCountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [branches, items] = await Promise.all([visibleBranches(actor), activeItems()]);
  return (
    <>
      <PageHeader title="Start a count" lede="Choose a full list or only the items you are counting. The book quantity is snapshotted when the count is created." />
      {params.error ? <p className="banner banner-bad mb-3">{params.error}</p> : null}
      <form action={countCreateAction} className="grid gap-3">
        <label className="field">
          <span>Branch</span>
          <select className="control" name="branchId" required defaultValue={branches[0]?.id}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="card max-h-96 overflow-auto p-3">
          <legend className="px-1 text-sm font-semibold">Items</legend>
          {items.map((item) => (
            <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="itemId" value={item.id} />
              {item.name} <span className="num text-muted">{item.sku}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Notes</span>
          <input className="control" name="notes" />
        </label>
        <button className="btn btn-primary" type="submit">Create count</button>
      </form>
    </>
  );
}
