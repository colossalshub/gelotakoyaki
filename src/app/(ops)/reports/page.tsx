import { Filters, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { visibleBranches } from "@/server/lookups";

const REPORTS = [
  ["inventory", "Current inventory"],
  ["valuation", "Valuation"],
  ["movements", "Stock movements"],
  ["low-stock", "Low and out of stock"],
  ["waste", "Waste"],
  ["variances", "Count variances"],
  ["shortages", "Shortages"],
  ["transfers", "Transfers"],
  ["purchasing", "Purchasing"],
  ["consumption", "Theoretical consumption versus recorded usage"],
  ["adjustments", "Adjustments"],
  ["staff", "Staff-attributed movements"],
  ["replenishment", "Replenishment"],
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const branches = await visibleBranches(actor);
  const query = new URLSearchParams();
  if (params.branch) query.set("branch", params.branch);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return (
    <>
      <PageHeader
        title="Reports"
        lede="Exports are UTF-8 CSV. Cells that could be read as spreadsheet formulas are prefixed so they stay text. Password hashes are never included."
      />
      {actor.role === "STAFF" ? <p className="banner">Staff accounts can record operations. Branch reports are available to managers and the owner.</p> : null}
      <Filters branches={branches} branch={params.branch} from={params.from} to={params.to} />
      <ul className="card divide-y divide-line">
        {REPORTS.map(([slug, label]) => (
          <li key={slug} className="flex items-center justify-between gap-3 px-3 py-3">
            <span>{label}</span>
            <a className="btn btn-small" href={`/api/exports/${slug}${suffix}`}>Download CSV</a>
          </li>
        ))}
      </ul>
    </>
  );
}
