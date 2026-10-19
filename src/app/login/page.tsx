import { loginAction } from "@/actions/auth";
import { LoginForm } from "@/components/login-form";
import { currentActor } from "@/server/current";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (await currentActor()) redirect("/dashboard");
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Gelos Takoyaki</p>
      <h1 className="mt-2 text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Inventory for both branches. There is no shared default password. The owner account is created from the server, not from this screen.
      </p>
      {params.notice === "password" ? <p className="banner banner-ok mt-4">Password updated. Sign in again.</p> : null}
      <LoginForm action={loginAction} />
    </main>
  );
}
