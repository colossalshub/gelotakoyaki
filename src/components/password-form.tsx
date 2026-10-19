"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function PasswordForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-md gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <label className="field"><span>Current password</span><input className="control" type="password" name="current" required /></label>
      <label className="field"><span>New password</span><input className="control" type="password" name="next" required minLength={12} /></label>
      <button className="btn btn-primary" disabled={pending} type="submit">Change password</button>
    </form>
  );
}
