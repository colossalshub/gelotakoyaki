import { changePasswordAction } from "@/actions/auth";
import { PasswordForm } from "@/components/password-form";
import { PageHeader } from "@/components/ui";
import { requireActorAllowPasswordChange } from "@/server/current";

export default async function AccountPage() {
  const actor = await requireActorAllowPasswordChange();
  return (
    <>
      <PageHeader title="Account" lede={`${actor.name} · ${actor.email}`} />
      <PasswordForm action={changePasswordAction} />
    </>
  );
}
