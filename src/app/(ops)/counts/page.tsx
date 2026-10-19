import Link from "next/link";
import { PageHeader, Pill } from "@/components/ui";
import { requireActor } from "@/server/current";
import { visibleBranchFilter } from "@/server/authz";
import { prisma } from "@/server/db";

export default async function CountsPage() {
  const actor = await requireActor();
  const counts = await prisma.stockCount.findMany({
    where: visibleBranchFilter(actor),
    include: { branch: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return (
    <>
      <PageHeader
        title="Stock counts"
        lede="A count compares a snapshot of the book with what was physically counted. Finalizing posts one adjustment for the approved difference."
        action={<Link className="btn btn-primary" href="/counts/new">New count</Link>}
      />
      <div className="card table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Branch</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((count) => (
              <tr key={count.id}>
                <td><Link href={`/counts/${count.id}`}>{count.number}</Link></td>
                <td>{count.branch.code}</td>
                <td><Pill>{count.status}</Pill></td>
              </tr>
            ))}
            {counts.length === 0 ? <tr><td colSpan={3}>No counts yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
