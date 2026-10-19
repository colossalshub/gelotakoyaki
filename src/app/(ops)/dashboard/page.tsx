import Link from "next/link";
import { Banner, Filters, Money, PageHeader, Pill } from "@/components/ui";
import { formatStamp } from "@/domain/dates";
import { MOVEMENT_LABELS } from "@/domain/constants";
import { loadDashboard } from "@/server/dashboard";
import { requireActor } from "@/server/current";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const data = await loadDashboard(actor, { branchId: params.branch, from: params.from, to: params.to });
  return (
    <>
      <PageHeader
        title="Dashboard"
        lede="Confirmed stock movements are listed separately from estimates. Missing sales or costs are called out instead of being filled in."
      />
      <Filters branches={data.branches} branch={params.branch} from={data.from} to={data.to} />
      {data.salesMissing ? (
        <Banner>No sales were recorded in this period, so recipe-based consumption was not calculated.</Banner>
      ) : null}
      {data.countsMissing ? (
        <Banner>No stock count was finalized in this period, so the gap between book stock and a physical count is unknown.</Banner>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Active items" value={String(data.itemCount)} />
        <Metric label="Low stock" value={String(data.low)} />
        <Metric label="Out of stock" value={String(data.out)} />
        <Metric label="Negative balances" value={String(data.negative)} />
      </section>
      <section className="mt-3 grid gap-3 sm:grid-cols-2">
        <article className="card p-4">
          <h2 className="text-sm font-semibold">Inventory value</h2>
          <p className="mt-2 text-2xl">
            <Money value={data.knownValue} />
          </p>
          <p className="mt-1 text-sm text-muted">
            Weighted average of items with complete cost history.
            {data.incompleteValueItems > 0
              ? ` ${data.incompleteValueItems} stocked item${data.incompleteValueItems === 1 ? "" : "s"} excluded because a cost is missing.`
              : " Every stocked item in this view has a cost."}
          </p>
        </article>
        <article className="card p-4">
          <h2 className="text-sm font-semibold">Today in {data.policy.timezone}</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <li>Receipts and openings <strong className="num">{data.activity.receipts}</strong></li>
            <li>Usage and recipe consumption <strong className="num">{data.activity.usage}</strong></li>
            <li>Waste records <strong className="num">{data.activity.waste}</strong></li>
            <li>Transfer movements <strong className="num">{data.activity.transfers}</strong></li>
          </ul>
          <p className="mt-2 text-sm text-muted">
            Waste cost today: {data.activity.wasteUnknown ? "partly unknown" : ""} <Money value={data.activity.wasteCost} />
          </p>
        </article>
      </section>
      <section className="mt-3 grid gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <h2 className="text-sm font-semibold">Waiting</h2>
          <p className="mt-2 text-sm">{data.openTransfers} transfer{data.openTransfers === 1 ? "" : "s"} not fully received.</p>
          <p className="text-sm">{data.openCounts} count{data.openCounts === 1 ? "" : "s"} not finalized.</p>
          <p className="mt-2 text-sm">
            <Link href="/transfers">Review transfers</Link>
          </p>
        </article>
        <article className="card p-4">
          <h2 className="text-sm font-semibold">Count variance in this period</h2>
          <p className="mt-2">
            <Money value={data.varianceCost} />
          </p>
          <p className="text-sm text-muted">
            {data.varianceUnknown > 0
              ? `${data.varianceUnknown} variance${data.varianceUnknown === 1 ? "" : "s"} have no cost because valuation is incomplete.`
              : "Cost is shown only where the weighted average is complete."}
          </p>
        </article>
        <article className="card p-4">
          <h2 className="text-sm font-semibold">Setup</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li>{data.onboarding.branches} branches</li>
            <li>{data.onboarding.items} active items</li>
            <li>{data.onboarding.opening} opening movements</li>
            <li>{data.onboarding.recipes} active recipes</li>
            <li>{data.onboarding.staff} staff or manager accounts</li>
          </ul>
          <Link className="mt-2 inline-block text-sm" href="/onboarding">
            Open the setup checklist
          </Link>
        </article>
      </section>
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Branches</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.branchCards.map((branch) => (
            <article key={branch.id} className="card p-4">
              <h3 className="font-semibold">
                {branch.code} · {branch.name}
              </h3>
              <p className="mt-2 text-sm">
                {branch.stocked} items with a balance · {branch.low} low · {branch.out} out
              </p>
              <p className="text-sm">
                Value <Money value={branch.value} />
                {branch.incomplete > 0 ? ` · ${branch.incomplete} incomplete` : ""}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Repeated shortages</h2>
          <Link href="/reports">Reports</Link>
        </div>
        {data.repeated.length === 0 ? (
          <p className="text-sm text-muted">No item has reached the repeated-shortage threshold in this period.</p>
        ) : (
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Item</th>
                  <th>Short counts</th>
                </tr>
              </thead>
              <tbody>
                {data.repeated.map((row) => (
                  <tr key={`${row.branchId}:${row.itemId}`}>
                    <td>{row.branch}</td>
                    <td>
                      <Link href={`/investigate?branch=${row.branchId}&item=${row.itemId}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td className="num">{row.times}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Recent activity</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted">No movements in this period.</p>
        ) : (
          <div className="card table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Branch</th>
                  <th>Item</th>
                  <th>What</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatStamp(movement.occurredAt, data.policy.timezone)}</td>
                    <td>{movement.branch.code}</td>
                    <td>{movement.item.name}</td>
                    <td>
                      <Pill>{MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}</Pill>
                    </td>
                    <td>{movement.user.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {data.expiring.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Expiring batches</h2>
          <ul className="card divide-y divide-line">
            {data.expiring.map((batch) => (
              <li key={batch.id} className="px-3 py-2 text-sm">
                {batch.branch.code} · {batch.item.name} · lot {batch.lotCode} ·{" "}
                {batch.expiryDate ? batch.expiryDate.toISOString().slice(0, 10) : "no date"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 text-2xl">{value}</p>
    </article>
  );
}
