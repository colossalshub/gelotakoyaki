import Link from "next/link";
import { notFound } from "next/navigation";
import { stockingAction } from "@/actions/catalog";
import { Banner, Money, PageHeader, QtyText, SignedQty } from "@/components/ui";
import { StockingForm } from "@/components/stocking-form";
import { MOVEMENT_LABELS } from "@/domain/constants";
import { formatStamp } from "@/domain/dates";
import { D } from "@/domain/decimal";
import { assertBranchVisible } from "@/server/authz";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";
import { visibleBranches } from "@/server/lookups";
import { getPolicy } from "@/server/settings";
import { reconcileItem } from "@/server/ledger";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const query = await searchParams;
  const item = await prisma.item.findUnique({
    where: { id },
    include: { baseUnit: true, purchaseUnit: true, category: true, supplier: true },
  });
  if (!item) notFound();
  const branches = await visibleBranches(actor);
  const balances = await prisma.inventoryBalance.findMany({ where: { itemId: item.id, branchId: { in: branches.map((branch) => branch.id) } } });
  const costs = await prisma.branchItemCost.findMany({ where: { itemId: item.id, branchId: { in: branches.map((branch) => branch.id) } } });
  const movements = await prisma.stockMovement.findMany({
    where: { itemId: item.id, branchId: { in: branches.map((branch) => branch.id) } },
    include: { branch: true, user: { select: { name: true } }, unit: true },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
  const policy = await getPolicy();
  const checks = await Promise.all(branches.map(async (branch) => ({ branch, check: await reconcileItem(branch.id, item.id) })));
  for (const branch of branches) assertBranchVisible(actor, branch.id);
  return (
    <>
      <PageHeader title={item.name} lede={`${item.sku} · ${item.category.name} · base unit ${item.baseUnit.code}`} />
      {query.notice ? <Banner tone="ok">Saved.</Banner> : null}
      <p className="mb-4 text-sm text-muted">
        Purchase unit {item.purchaseUnit.code}, conversion factor {D(item.purchaseToBaseFactor).toFixed()} {item.baseUnit.code} per {item.purchaseUnit.code}.
        {item.baseUnit.dimension !== item.purchaseUnit.dimension
          ? " This factor was entered explicitly. Density is not assumed."
          : " Same-family units use the unit table, not a guessed density."}
      </p>
      {!checks.every((entry) => entry.check.ok) ? (
        <Banner tone="bad">The cached balance does not match the ledger. Run the reconcile command before trusting this item.</Banner>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {branches.map((branch) => {
          const balance = balances.find((row) => row.branchId === branch.id);
          const cost = costs.find((row) => row.branchId === branch.id);
          return (
            <article key={branch.id} className="card p-4">
              <h2 className="font-semibold">
                {branch.code} · {branch.name}
              </h2>
              <p className="mt-2 text-2xl">
                <QtyText value={balance ? D(balance.quantity) : 0} unit={item.baseUnit.code} />
              </p>
              <p className="text-sm">
                {cost?.costComplete ? (
                  <>
                    Average <Money value={cost.avgCost} /> · value <Money value={cost.totalValue} />
                  </>
                ) : (
                  "Valuation incomplete. At least one inbound quantity has no unit cost."
                )}
              </p>
              <p className="mt-2 text-sm">
                <Link href={`/investigate?branch=${branch.id}&item=${item.id}`}>Investigate</Link>
              </p>
              <StockingForm action={stockingAction} branchId={branch.id} itemId={item.id} />
            </article>
          );
        })}
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold">Ledger</h2>
      <div className="card table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Branch</th>
              <th>Type</th>
              <th>Change</th>
              <th>Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td>{formatStamp(movement.occurredAt, policy.timezone)}</td>
                <td>{movement.branch.code}</td>
                <td>{MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}</td>
                <td>
                  <SignedQty value={D(movement.quantityDelta)} unit={movement.unit.code} />
                </td>
                <td>{movement.user.name}</td>
              </tr>
            ))}
            {movements.length === 0 ? (
              <tr>
                <td colSpan={5}>No movements for the branches you can see.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
