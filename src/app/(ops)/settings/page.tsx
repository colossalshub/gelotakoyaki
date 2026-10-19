import Link from "next/link";
import { categoryAction, supplierAction } from "@/actions/catalog";
import { PageHeader } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";
import { requireActor } from "@/server/current";
import { prisma } from "@/server/db";

export default async function SettingsPage() {
  const actor = await requireActor();
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Settings" lede="Branches, people, the catalog, and inventory policy. Stock quantities are not edited here." />
      <ul className="card mb-6 divide-y divide-line">
        {[
          ["/settings/branches", "Branches"],
          ["/settings/users", "People and permissions"],
          ["/settings/catalog", "Items"],
          ["/settings/policies", "Inventory policy"],
          ["/onboarding", "Setup checklist"],
        ].map(([href, label]) => (
          <li key={href}>
            <Link className="flex min-h-12 items-center px-3" href={href}>{label}</Link>
          </li>
        ))}
      </ul>
      {actor.role === "OWNER" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-2 font-semibold">Categories</h2>
            <ul className="mb-3 text-sm">{categories.map((category) => <li key={category.id}>{category.name}</li>)}</ul>
            <SimpleForm action={categoryAction} fields={[{ name: "name", label: "New category" }, { name: "description", label: "Description" }]} submit="Add category" />
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Suppliers</h2>
            <ul className="mb-3 text-sm">{suppliers.map((supplier) => <li key={supplier.id}>{supplier.name}</li>)}</ul>
            <SimpleForm action={supplierAction} fields={[{ name: "name", label: "Supplier name" }, { name: "contact", label: "Contact" }]} submit="Add supplier" />
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted">Only the owner can change categories, suppliers, and policy.</p>
      )}
    </>
  );
}
