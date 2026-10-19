"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function ResolveForm({
  action,
  transferId,
  lines,
  reasons,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  transferId: string;
  lines: Array<{ id: string; name: string }>;
  reasons: Array<{ code: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-lg gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <input type="hidden" name="transferId" value={transferId} />
      <label className="field">
        <span>Line</span>
        <select className="control" name="lineId" required>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>{line.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Quantity to write off, in the item base unit</span>
        <input className="control" name="quantity" inputMode="decimal" required />
      </label>
      <label className="field">
        <span>Reason</span>
        <select className="control" name="reason" required>
          {reasons.map((reason) => (
            <option key={reason.code} value={reason.code}>{reason.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>What was checked</span>
        <textarea className="control min-h-20" name="notes" required />
      </label>
      <button className="btn" type="submit" disabled={pending}>Record discrepancy</button>
    </form>
  );
}
