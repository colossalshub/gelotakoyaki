import Link from "next/link";
import { Banner, PageHeader, Pill } from "@/components/ui";
import { inTransitQuantity } from "@/domain/transfers";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";
import { visibleBranches } from "@/server/lookups";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const branches = await visibleBranches(actor);
  const ids = branches.map((branch) => branch.id);
  const transfers = await prisma.stockTransfer.findMany({
    where: actor.role === "OWNER" ? {} : { OR: [{ sourceBranchId: { in: ids } }, { destBranchId: { in: ids } }] },
    include: { source: true, dest: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return (
    <>
      <PageHeader
        title="Transfers"
        lede="Stock leaves the source when it is dispatched. It is not available at the destination until that branch confirms the quantity received."
        action={
          <Link className="btn btn-primary" href="/transfers/new">
            New transfer
          </Link>
        }
      />
      {params.notice ? <Banner tone="ok">Transfer updated.</Banner> : null}
      <div className="card table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Route</th>
              <th>Status</th>
              <th>In transit</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => {
              const transit = transfer.lines.reduce((sum, line) => sum.plus(inTransitQuantity(line)), inTransitQuantity({
                dispatchedQty: 0,
                receivedQty: 0,
                damagedQty: 0,
                rejectedQty: 0,
                lossQty: 0,
              }).minus(0));
              return (
                <tr key={transfer.id}>
                  <td>
                    <Link href={`/transfers/${transfer.id}`}>{transfer.number}</Link>
                  </td>
                  <td>
                    {transfer.source.code} → {transfer.dest.code}
                  </td>
                  <td>
                    <Pill>{transfer.status}</Pill>
                  </td>
                  <td className="num">{transit.toFixed()}</td>
                </tr>
              );
            })}
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={4}>No transfers yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
