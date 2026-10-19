import { notFound } from "next/navigation";
import { reverseReceiptAction } from "@/actions/stock";
import { Banner, PageHeader, Pill, QtyText } from "@/components/ui";
import { D } from "@/domain/decimal";
import { assertBranchVisible } from "@/server/authz";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function ReceiptDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const query = await searchParams;
  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: { branch: true, supplier: true, lines: { include: { item: { include: { baseUnit: true } }, enteredUnit: true } } },
  });
  if (!receipt) notFound();
  assertBranchVisible(actor, receipt.branchId);
  return (
    <>
      <PageHeader title={receipt.number} lede={`${receipt.branch.code} · ${receipt.supplier?.name ?? "No supplier"}`} />
      {query.notice ? <Banner tone="ok">Updated.</Banner> : null}
      {query.error ? <Banner tone="bad">{query.error}</Banner> : null}
      <p className="mb-3">
        <Pill>{receipt.status}</Pill>
      </p>
      {receipt.invoiceRef ? <p className="text-sm">Invoice {receipt.invoiceRef}</p> : null}
      <div className="card mt-3 table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Delivered</th>
              <th>Accepted</th>
              <th>Damaged</th>
              <th>Rejected</th>
              <th>Stock added</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.item.name}</td>
                <td>
                  <QtyText value={D(line.enteredQuantity)} unit={line.enteredUnit.code} />
                </td>
                <td className="num">{D(line.acceptedQuantity).toFixed()}</td>
                <td className="num">{D(line.damagedQuantity).toFixed()}</td>
                <td className="num">{D(line.rejectedQuantity).toFixed()}</td>
                <td>{line.baseQuantity ? <QtyText value={D(line.baseQuantity)} unit={line.item.baseUnit.code} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {receipt.status === "POSTED" && actor.role !== "STAFF" ? (
        <form action={reverseReceiptAction} className="mt-4 grid max-w-lg gap-2">
          <input type="hidden" name="id" value={receipt.id} />
          <label className="field">
            <span>Reason for reversal</span>
            <input className="control" name="reason" required />
          </label>
          <button className="btn btn-danger" type="submit">
            Reverse this receipt
          </button>
        </form>
      ) : null}
    </>
  );
}
