import { PageHeader, QtyText } from "@/components/ui";
import { requireActor } from "@/server/current";
import { visibleBranches } from "@/server/lookups";
import { replenishmentForBranch } from "@/server/replenishment";

export default async function ReplenishmentPage() {
  const actor = await requireActor();
  const branches = await visibleBranches(actor);
  const groups = await Promise.all(branches.map(async (branch) => ({ branch, lines: await replenishmentForBranch(branch.id) })));
  return (
    <>
      <PageHeader
        title="What to buy or move"
        lede="Suggested quantity = target − available − stock already dispatched toward this branch. Requests that have not been dispatched, and supplier orders that have not arrived, are not treated as guaranteed."
      />
      {groups.map(({ branch, lines }) => (
        <section key={branch.id} className="mb-6">
          <h2 className="mb-2 font-semibold">{branch.code} · {branch.name}</h2>
          {lines.filter((line) => line.suggested.gt(0)).length === 0 ? <p className="text-sm text-muted">Nothing is below its target after incoming stock.</p> : (
            <div className="card table-scroll">
              <table className="data-table">
                <thead><tr><th>Item</th><th>Available</th><th>Incoming</th><th>Suggested</th><th>Why</th></tr></thead>
                <tbody>
                  {lines.filter((line) => line.suggested.gt(0)).map((line) => (
                    <tr key={line.itemId}>
                      <td>{line.name}</td>
                      <td><QtyText value={line.available} unit={line.unit} /></td>
                      <td><QtyText value={line.incoming} unit={line.unit} /></td>
                      <td><QtyText value={line.suggested} unit={line.unit} /></td>
                      <td className="text-sm">{line.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <p className="text-sm text-muted">This list does not place an order.</p>
    </>
  );
}
