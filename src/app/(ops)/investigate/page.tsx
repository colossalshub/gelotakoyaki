import Link from "next/link";
import { Banner, Money, PageHeader, QtyText, SignedQty } from "@/components/ui";
import { MOVEMENT_LABELS } from "@/domain/constants";
import { formatStamp } from "@/domain/dates";
import { D } from "@/domain/decimal";
import { investigateItem } from "@/server/investigate";
import { requireActor } from "@/server/current";
import { getPolicy } from "@/server/settings";

export default async function InvestigatePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; item?: string; line?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  if (!params.branch || !params.item) {
    return (
      <>
        <PageHeader title="Discrepancy review" lede="Open this from a stock count or a repeated shortage. The page shows records. It does not decide that anyone took stock." />
        <Banner>Choose an item from a count or the dashboard.</Banner>
      </>
    );
  }
  const data = await investigateItem(actor, { branchId: params.branch, itemId: params.item, countLineId: params.line });
  const policy = await getPolicy();
  return (
    <>
      <PageHeader
        title={`${data.item.name} at ${data.branch.code}`}
        lede="These are the records between the previous count and this snapshot. A shortage is a variance, not a finding of theft."
      />
      {data.focus ? (
        <article className="card mb-4 p-4">
          <h2 className="font-semibold">This count</h2>
          <p>Expected <QtyText value={D(data.focus.expectedQty)} unit={data.item.baseUnit.code} /></p>
          <p>Counted {data.focus.countedQty ? <QtyText value={D(data.focus.countedQty)} unit={data.item.baseUnit.code} /> : "—"}</p>
          <p>Variance {data.focus.varianceQty ? <QtyText value={D(data.focus.varianceQty)} unit={data.item.baseUnit.code} /> : "—"}</p>
          <p>Cost impact {data.focus.costKnown ? <Money value={data.focus.varianceCost} /> : "Cost unknown"}</p>
          <p className="text-sm text-muted">Reason: {data.focus.reasonCode ?? "Not recorded"} {data.focus.notes ?? ""}</p>
        </article>
      ) : (
        <Banner>No finalized count for this item yet. The lists below use the last 30 days.</Banner>
      )}
      <Section title="Previous count variances" rows={data.history.map((line) => `${formatStamp(line.snapshotAt, policy.timezone)} · variance ${line.varianceQty ? D(line.varianceQty).toFixed() : "—"} · ${line.reasonCode ?? "no reason"}`)} />
      <MovementSection title="Receipts" rows={data.receipts} zone={policy.timezone} />
      <MovementSection title="Transfers" rows={data.transfers} zone={policy.timezone} />
      <MovementSection title="Recorded waste" rows={data.waste} zone={policy.timezone} />
      <MovementSection title="Recipe-based consumption" rows={data.theoretical} zone={policy.timezone} />
      <MovementSection title="Recorded actual usage" rows={data.actual} zone={policy.timezone} />
      <MovementSection title="Adjustments and reversals" rows={data.adjustments} zone={policy.timezone} />
      <section className="mt-4">
        <h2 className="font-semibold">Sales in the window</h2>
        {data.sales.length === 0 ? <p className="text-sm text-muted">No sales were recorded in this window.</p> : (
          <ul className="text-sm">{data.sales.map((sale) => <li key={sale.id}>{formatStamp(sale.soldAt, policy.timezone)} · {sale.menuItem.name} · {D(sale.quantity).toFixed()}</li>)}</ul>
        )}
      </section>
      <section className="mt-4">
        <h2 className="font-semibold">People who recorded movements</h2>
        <p className="text-sm text-muted">This is attribution of the record, not blame for the variance.</p>
        <ul className="text-sm">{[...new Set(data.movements.map((movement) => movement.user.name))].map((name) => <li key={name}>{name}</li>)}</ul>
      </section>
      {data.afterSnapshot.length > 0 ? (
        <section className="mt-4">
          <h2 className="font-semibold">Movements after the snapshot</h2>
          <p className="text-sm text-muted">These are not part of the variance. They happened later.</p>
          <MovementSection title="" rows={data.afterSnapshot} zone={policy.timezone} />
        </section>
      ) : null}
      <p className="mt-4 text-sm"><Link href={`/inventory/${data.item.id}`}>Back to the item</Link></p>
    </>
  );
}

function Section({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="mt-4">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">None in this window.</p> : <ul className="text-sm">{rows.map((row) => <li key={row}>{row}</li>)}</ul>}
    </section>
  );
}

function MovementSection({
  title,
  rows,
  zone,
}: {
  title: string;
  rows: Array<{ id: string; occurredAt: Date; movementType: string; quantityDelta: { toString(): string }; user: { name: string }; reason: string | null }>;
  zone: string;
}) {
  return (
    <section className="mt-4">
      {title ? <h2 className="font-semibold">{title}</h2> : null}
      {rows.length === 0 ? <p className="text-sm text-muted">None in this window.</p> : (
        <ul className="text-sm">
          {rows.map((row) => (
            <li key={row.id}>
              {formatStamp(row.occurredAt, zone)} · {MOVEMENT_LABELS[row.movementType] ?? row.movementType} · <SignedQty value={D(row.quantityDelta)} /> · {row.user.name}
              {row.reason ? ` · ${row.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
