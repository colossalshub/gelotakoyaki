import { userAction } from "@/actions/catalog";
import { PageHeader } from "@/components/ui";
import { UserForm } from "@/components/user-form";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requireActor();
  const params = await searchParams;
  const [users, branches] = await Promise.all([
    prisma.user.findMany({ include: { branches: true }, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="People" lede="The owner sees every branch. Everyone else only sees the branches assigned here. Permissions are checked on the server." />
      {params.notice ? <p className="banner banner-ok mb-3">Saved.</p> : null}
      {params.error ? <p className="banner banner-bad mb-3">{params.error}</p> : null}
      <div className="card mb-6 table-scroll">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branches</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}{user.active ? "" : " (inactive)"}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.role === "OWNER" ? "All" : String(user.branches.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {actor.role === "OWNER" ? (
        <UserForm action={userAction} branches={branches.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name }))} />
      ) : null}
    </>
  );
}
