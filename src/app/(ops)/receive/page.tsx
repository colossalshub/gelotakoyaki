import Link from "next/link";
import { Banner, PageHeader, Pill } from "@/components/ui";
import { requireActor } from "@/server/current";
import { visibleBranchFilter } from "@/server/authz";
import { prisma } from "@/server/db";

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const where = visibleBranchFilter(actor);
  const receipts = await prisma.goodsReceipt.findMany({
    where,
    include: { branch: true, supplier: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return (
    <>
      <PageHeader
        title="Receive stock"
        lede="A receipt increases stock only when it is posted. Posted receipts stay on record; corrections are reversals."
        action={
          <Link className="btn btn-primary" href="/receive/new">
            New receipt
          </Link>
        }
      />
      {params.notice === "posted" ? <Banner tone="ok">Receipt posted.</Banner> : null}
      <p className="mb-4 text-sm">
        <Link href="/opening">Enter opening stock</Link> · <Link href="/purchase-orders">Purchase orders</Link>
      </p>
      {receipts.length === 0 ? (
        <p className="text-sm text-muted">No receipts yet.</p>
      ) : (
        <div className="card table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Branch</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>
                    <Link href={`/receive/${receipt.id}`}>{receipt.number}</Link>
                  </td>
                  <td>{receipt.branch.code}</td>
                  <td>{receipt.supplier?.name ?? "—"}</td>
                  <td>
                    <Pill>{receipt.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
