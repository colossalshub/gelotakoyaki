"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function UserForm({
  action,
  branches,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  branches: Array<{ id: string; code: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      <h2 className="font-semibold">Add a person</h2>
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <label className="field"><span>Name</span><input className="control" name="name" required /></label>
      <label className="field"><span>Email</span><input className="control" name="email" type="email" required /></label>
      <label className="field"><span>Temporary password</span><input className="control" name="password" type="password" required minLength={12} /></label>
      <label className="field">
        <span>Role</span>
        <select className="control" name="role" defaultValue="STAFF">
          <option value="STAFF">Staff</option>
          <option value="BRANCH_MANAGER">Branch manager</option>
        </select>
      </label>
      {branches.map((branch) => (
        <fieldset key={branch.id} className="card p-3 text-sm">
          <legend className="px-1">{branch.code}</legend>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="branchId" value={branch.id} /> Assign this branch</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name={`receive:${branch.id}`} /> Can receive stock</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name={`count:${branch.id}`} /> Can count stock</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name={`dispatch:${branch.id}`} /> Can dispatch transfers</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name={`treceive:${branch.id}`} /> Can receive transfers</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name={`sales:${branch.id}`} /> Can record sales</label>
          <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name={`approve:${branch.id}`} /> Can approve adjustments</label>
        </fieldset>
      ))}
      <p className="text-sm text-muted">They will be asked to change this password. Share it outside the system.</p>
      <button className="btn btn-primary" disabled={pending} type="submit">Create account</button>
    </form>
  );
}
