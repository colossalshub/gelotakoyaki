import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "@/domain/permissions";
import { actorFromToken, SESSION_COOKIE } from "@/server/auth";

export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  return actorFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function requireActorAllowPasswordChange(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}
