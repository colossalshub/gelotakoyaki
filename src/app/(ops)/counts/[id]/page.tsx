import Link from "next/link";
import { notFound } from "next/navigation";
import { countRecordAction, finalizeCountAction, reviewCountAction } from "@/actions/stock";
import { CountSheet } from "@/components/count-sheet";
import { Banner, Money, PageHeader, Pill, QtyText } from "@/components/ui";
import { formatQty } from "@/domain/format";
import { D } from "@/domain/decimal";
import { can } from "@/domain/permissions";
import { assertBranchVisible } from "@/server/authz";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function CountDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const query = await searchParams;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { branch: true, lines: { include: { item: { include: { baseUnit: true } } } }, counter: true },
  });
  if (!count) notFound();
  assertBranchVisible(actor, count.branchId);
  return (
    <>
      <PageHeader title={count.number} lede={`${count.branch.name} · counted by ${count.counter.name}`} />
      {query.notice ? <Banner tone="ok">Updated.</Banner> : null}
      {query.error ? <Banner tone="bad">{query.error}</Banner> : null}
      <Pill>{count.status}</Pill>
      <p className="mt-3 text-sm text-muted">
        Variance is counted quantity minus the book quantity at the snapshot. Movements after the snapshot block finalizing so two measurement times are not mixed.
      </p>
      {count.status === "DRAFT" ? (
        <div className="mt-4">
          <CountSheet
            action={countRecordAction}
            countId={count.id}
            lines={count.lines.map((line) => ({
              itemId: line.itemId,
              name: line.item.name,
              unit: line.item.baseUnit.code,
              expected: formatQty(D(line.expectedQty)),
              counted: line.countedQty ? formatQty(D(line.countedQty)) : "",
              reason: line.reasonCode ?? "",
            }))}
          />
        </div>
      ) : (
        <div className="card mt-4 table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Expected</th>
                <th>Counted</th>
                <th>Variance</th>
                <th>Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {count.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.item.name}</td>
                  <td><QtyText value={D(line.expectedQty)} unit={line.item.baseUnit.code} /></td>
                  <td>{line.countedQty ? <QtyText value={D(line.countedQty)} unit={line.item.baseUnit.code} /> : "—"}</td>
                  <td className="num">{line.varianceQty ? formatQty(D(line.varianceQty)) : "—"}</td>
                  <td>{line.costKnown ? <Money value={line.varianceCost} /> : "Cost unknown"}</td>
                  <td>
                    <Link href={`/investigate?branch=${count.branchId}&item=${line.itemId}&line=${line.id}`}>Evidence</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {count.status === "SUBMITTED" && can(actor, "inventory.count.review", count.branchId) ? (
          <form action={reviewCountAction}>
            <input type="hidden" name="countId" value={count.id} />
            <button className="btn" type="submit">Mark reviewed</button>
          </form>
        ) : null}
        {["REVIEWED", "SUBMITTED"].includes(count.status) && can(actor, "inventory.count.finalize", count.branchId) ? (
          <form action={finalizeCountAction}>
            <input type="hidden" name="countId" value={count.id} />
            <input type="hidden" name="finalizeKey" value={`finalize-${count.id}`} />
            <button className="btn btn-primary" type="submit">Finalize adjustment</button>
          </form>
        ) : null}
      </div>
    </>
  );
}
