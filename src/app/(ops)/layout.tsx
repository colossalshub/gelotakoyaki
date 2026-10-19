import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { requireActor } from "@/server/current";

export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const jar = await cookies();
  const theme = jar.get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <Shell actor={actor} theme={theme}>
      {actor.mustChangePassword ? (
        <p className="banner mb-4">
          Change the temporary password on the account page before posting stock.
        </p>
      ) : null}
      {children}
    </Shell>
  );
}
