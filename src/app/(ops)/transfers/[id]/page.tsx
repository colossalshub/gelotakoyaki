import { notFound } from "next/navigation";
import { dispatchAction, resolveTransferAction } from "@/actions/stock";
import { TransferReceiveForm } from "@/components/transfer-receive-form";
import { Banner, PageHeader, Pill, QtyText } from "@/components/ui";
import { DISCREPANCY_REASONS } from "@/domain/constants";
import { D } from "@/domain/decimal";
import { formatQty } from "@/domain/format";
import { inTransitQuantity } from "@/domain/transfers";
import { can } from "@/domain/permissions";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";
import { ResolveForm } from "@/components/resolve-form";

export default async function TransferDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const query = await searchParams;
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      source: true,
      dest: true,
      lines: { include: { item: { include: { baseUnit: true } }, unit: true } },
    },
  });
  if (!transfer) notFound();
  const canSee = actor.role === "OWNER" || actor.branches.some((branch) => branch.branchId === transfer.sourceBranchId || branch.branchId === transfer.destBranchId);
  if (!canSee) notFound();
  const open = ["DISPATCHED", "PARTIALLY_RECEIVED"].includes(transfer.status);
  return (
    <>
      <PageHeader title={transfer.number} lede={`${transfer.source.code} → ${transfer.dest.code}`} />
      {query.notice ? <Banner tone="ok">Updated.</Banner> : null}
      {query.error ? <Banner tone="bad">{query.error}</Banner> : null}
      <Pill>{transfer.status}</Pill>
      <div className="card mt-4 table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Requested</th>
              <th>Dispatched</th>
              <th>Received</th>
              <th>Unresolved</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.item.name}</td>
                <td>
                  <QtyText value={D(line.enteredQuantity)} unit={line.unit.code} />
                </td>
                <td className="num">{formatQty(D(line.dispatchedQty))}</td>
                <td className="num">{formatQty(D(line.receivedQty))}</td>
                <td className="num">{formatQty(inTransitQuantity(line))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {transfer.status === "REQUESTED" && can(actor, "inventory.transfer.dispatch", transfer.sourceBranchId) ? (
        <form action={dispatchAction} className="mt-4">
          <input type="hidden" name="id" value={transfer.id} />
          <input type="hidden" name="idempotencyKey" value={`dispatch-${transfer.id}`} />
          <button className="btn btn-primary" type="submit">
            Dispatch from {transfer.source.code}
          </button>
        </form>
      ) : null}
      {open && can(actor, "inventory.transfer.receive", transfer.destBranchId) ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Receive at {transfer.dest.code}</h2>
          <TransferReceiveForm
            action={(await import("@/actions/stock")).receiveTransferAction}
            transferId={transfer.id}
            lines={transfer.lines
              .filter((line) => inTransitQuantity(line).gt(0))
              .map((line) => {
                const perEntered = D(line.enteredQuantity).eq(0) ? D(1) : D(line.requestedQty).div(D(line.enteredQuantity));
                const remainingEntered = inTransitQuantity(line).div(perEntered);
                return {
                  id: line.id,
                  name: line.item.name,
                  unit: line.unit.code,
                  remaining: formatQty(remainingEntered),
                };
              })}
          />
        </section>
      ) : null}
      {open && can(actor, "inventory.transfer.resolve", transfer.destBranchId) ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Write off an unresolved quantity</h2>
          <p className="mb-2 text-sm text-muted">This does not add stock anywhere. It records that the difference will not arrive.</p>
          <ResolveForm action={resolveTransferAction} transferId={transfer.id} lines={transfer.lines.filter((line) => inTransitQuantity(line).gt(0)).map((line) => ({ id: line.id, name: line.item.name }))} reasons={DISCREPANCY_REASONS.map((reason) => ({ code: reason.code, label: reason.label }))} />
        </section>
      ) : null}
    </>
  );
}
