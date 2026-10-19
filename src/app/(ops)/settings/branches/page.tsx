import { branchAction } from "@/actions/catalog";
import { PageHeader } from "@/components/ui";
import { BranchEditor } from "@/components/branch-editor";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function BranchesPage() {
  const actor = await requireActor();
  const branches = await prisma.branch.findMany({ orderBy: { code: "asc" } });
  return (
    <>
      <PageHeader title="Branches" lede="Two starter branches are created with no address and no stock. Rename them to the real shops. The database is not limited to two." />
      {branches.map((branch) => (
        <article key={branch.id} className="card mb-3 p-4">
          <h2 className="font-semibold">{branch.code} · {branch.name}</h2>
          {branch.notes ? <p className="text-sm text-muted">{branch.notes}</p> : null}
          {actor.role === "OWNER" ? (
            <BranchEditor
              action={branchAction}
              branch={{ id: branch.id, code: branch.code, name: branch.name, notes: branch.notes, active: branch.active }}
            />
          ) : null}
        </article>
      ))}
      {actor.role === "OWNER" ? (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Add a branch</h2>
          <BranchEditor action={branchAction} />
        </section>
      ) : null}
    </>
  );
}
