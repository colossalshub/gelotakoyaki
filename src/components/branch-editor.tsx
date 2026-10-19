"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function BranchEditor({
  action,
  branch,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  branch?: { id: string; code: string; name: string; notes: string | null; active: boolean };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3 grid gap-2">
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {branch ? <input type="hidden" name="id" value={branch.id} /> : null}
      <label className="field"><span>Code</span><input className="control" name="code" required defaultValue={branch?.code ?? ""} /></label>
      <label className="field"><span>Name</span><input className="control" name="name" required defaultValue={branch?.name ?? ""} /></label>
      <label className="field"><span>Notes</span><input className="control" name="notes" defaultValue={branch?.notes ?? ""} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={branch?.active ?? true} /> Active</label>
      <button className="btn" disabled={pending} type="submit">{branch ? "Save branch" : "Create branch"}</button>
    </form>
  );
}
