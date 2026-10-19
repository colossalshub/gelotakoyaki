import { redirect } from "next/navigation";
import { currentActor } from "@/server/current";

export default async function Home() {
  const actor = await currentActor();
  redirect(actor ? "/dashboard" : "/login");
}
