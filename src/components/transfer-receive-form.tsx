"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/actions/types";
import { DISCREPANCY_REASONS } from "@/domain/constants";

export function TransferReceiveForm({
  action,
  transferId,
  lines,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  transferId: string;
  lines: Array<{ id: string; name: string; unit: string; remaining: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [rows, setRows] = useState(lines.map((line) => ({ lineId: line.id, receivedQty: "", damagedQty: "", rejectedQty: "", reason: "", notes: "" })));
  return (
    <form action={formAction} className="grid gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <input type="hidden" name="transferId" value={transferId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="lines" value={JSON.stringify(rows.filter((row) => row.receivedQty || row.damagedQty || row.rejectedQty))} />
      {lines.map((line, index) => (
        <fieldset key={line.id} className="card grid gap-2 p-3">
          <legend className="px-1 text-sm font-semibold">
            {line.name} · {line.remaining} {line.unit} still in transit
          </legend>
          <label className="field">
            <span>Received ({line.unit})</span>
            <input className="control" inputMode="decimal" value={rows[index]?.receivedQty ?? ""} onChange={(event) => setRows((current) => current.map((row, position) => position === index ? { ...row, receivedQty: event.target.value } : row))} />
          </label>
          <label className="field">
            <span>Damaged</span>
            <input className="control" inputMode="decimal" value={rows[index]?.damagedQty ?? ""} onChange={(event) => setRows((current) => current.map((row, position) => position === index ? { ...row, damagedQty: event.target.value } : row))} />
          </label>
          <label className="field">
            <span>Rejected</span>
            <input className="control" inputMode="decimal" value={rows[index]?.rejectedQty ?? ""} onChange={(event) => setRows((current) => current.map((row, position) => position === index ? { ...row, rejectedQty: event.target.value } : row))} />
          </label>
          <label className="field">
            <span>Reason if damaged or rejected</span>
            <select className="control" value={rows[index]?.reason ?? ""} onChange={(event) => setRows((current) => current.map((row, position) => position === index ? { ...row, reason: event.target.value } : row))}>
              <option value="">Choose</option>
              {DISCREPANCY_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>{reason.label}</option>
              ))}
            </select>
          </label>
        </fieldset>
      ))}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Receiving…" : "Confirm receipt"}
      </button>
    </form>
  );
}
