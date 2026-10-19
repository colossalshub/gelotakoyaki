"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/actions/types";

export function SaleForm({
  action,
  branches,
  menus,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  branches: Array<{ id: string; code: string; name: string }>;
  menus: Array<{ id: string; sku: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return (
    <form action={formAction} className="grid max-w-lg gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="field">
        <span>Branch</span>
        <select className="control" name="branchId" required defaultValue={branches[0]?.id}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Menu item</span>
        <select className="control" name="menuItemId" required>
          {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Servings sold</span>
        <input className="control" name="quantity" inputMode="decimal" required />
      </label>
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Posting…" : "Post sale"}</button>
    </form>
  );
}
