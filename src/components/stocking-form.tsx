"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function StockingForm({
  action,
  branchId,
  itemId,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  branchId: string;
  itemId: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-3 grid gap-2">
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="itemId" value={itemId} />
      <label className="field">
        <span>Reorder point</span>
        <input className="control" name="reorderPoint" inputMode="decimal" defaultValue="0" />
      </label>
      <label className="field">
        <span>Target stock</span>
        <input className="control" name="targetLevel" inputMode="decimal" defaultValue="0" />
      </label>
      <button className="btn btn-small" type="submit" disabled={pending}>
        Save levels
      </button>
    </form>
  );
}
