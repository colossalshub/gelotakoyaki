"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/actions/types";
import { changePassword, login, logout, SESSION_COOKIE } from "@/server/auth";
import { requireActorAllowPasswordChange } from "@/server/current";
import { publicErrorMessage, rethrowNavigation } from "@/server/errors";

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const result = await login({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      ip,
      remember: formData.get("remember") === "on",
    });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.expiresAt,
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActorAllowPasswordChange();
  try {
    await changePassword(actor, String(formData.get("current") ?? ""), String(formData.get("next") ?? ""));
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  redirect("/login?notice=password");
}
