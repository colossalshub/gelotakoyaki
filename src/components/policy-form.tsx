"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";
import type { InventoryPolicy } from "@/domain/constants";

export function PolicyForm({ action, policy }: { action: (state: FormState, formData: FormData) => Promise<FormState>; policy: InventoryPolicy }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-lg gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="preventNegativeStock" defaultChecked={policy.preventNegativeStock} /> Prevent negative stock</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="requireCountApproval" defaultChecked={policy.requireCountApproval} /> Require a review before a count is finalized</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="separateCountDuties" defaultChecked={policy.separateCountDuties} /> The counter cannot approve their own count</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="requireTransferDiscrepancyApproval" defaultChecked={policy.requireTransferDiscrepancyApproval} /> Damaged transfer quantities need an approver</label>
      <label className="field"><span>Repeated shortage threshold</span><input className="control" name="repeatedShortageThreshold" defaultValue={String(policy.repeatedShortageThreshold)} /></label>
      <label className="field"><span>Expiry warning days</span><input className="control" name="expiryWarningDays" defaultValue={String(policy.expiryWarningDays)} /></label>
      <button className="btn btn-primary" disabled={pending} type="submit">Save policy</button>
    </form>
  );
}
