import { policyAction } from "@/actions/catalog";
import { PolicyForm } from "@/components/policy-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/server/current";
import { getPolicy } from "@/server/settings";

export default async function PoliciesPage() {
  const actor = await requireActor();
  const policy = await getPolicy();
  return (
    <>
      <PageHeader title="Inventory policy" lede="Currency stays PHP and the business clock stays Asia/Manila. These switches change how stock is allowed to move." />
      {actor.role === "OWNER" ? <PolicyForm action={policyAction} policy={policy} /> : <p>Only the owner can change policy.</p>}
    </>
  );
}
