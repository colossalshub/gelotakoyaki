"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function LoginForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 grid gap-3">
      {state.error ? (
        <p className="banner banner-bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <label className="field">
        <span>Email</span>
        <input className="control" name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="control" name="password" type="password" autoComplete="current-password" required />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input name="remember" type="checkbox" />
        Keep me signed in on this device
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
