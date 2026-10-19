"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/actions/types";
import { DISCREPANCY_REASONS } from "@/domain/constants";

export function CountSheet({
  action,
  countId,
  lines,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  countId: string;
  lines: Array<{ itemId: string; name: string; unit: string; expected: string; counted: string; reason: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [entries, setEntries] = useState(
    lines.map((line) => ({ itemId: line.itemId, countedQty: line.counted, reasonCode: line.reason, notes: "" })),
  );
  return (
    <form action={formAction} className="grid gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <input type="hidden" name="countId" value={countId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      {lines.map((line, index) => (
        <fieldset key={line.itemId} className="card grid gap-2 p-3">
          <legend className="px-1 font-semibold">{line.name}</legend>
          <p className="text-sm text-muted">
            Book quantity at snapshot: <span className="num">{line.expected} {line.unit}</span>
          </p>
          <label className="field">
            <span>Counted ({line.unit})</span>
            <input
              className="control"
              inputMode="decimal"
              value={entries[index]?.countedQty ?? ""}
              onChange={(event) =>
                setEntries((current) => current.map((entry, position) => (position === index ? { ...entry, countedQty: event.target.value } : entry)))
              }
            />
          </label>
          <label className="field">
            <span>Reason if it differs</span>
            <select
              className="control"
              value={entries[index]?.reasonCode ?? ""}
              onChange={(event) =>
                setEntries((current) => current.map((entry, position) => (position === index ? { ...entry, reasonCode: event.target.value } : entry)))
              }
            >
              <option value="">No variance, or choose a reason</option>
              {DISCREPANCY_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <button className="btn" name="intent" value="save" type="submit" disabled={pending}>
          Save draft
        </button>
        <button className="btn btn-primary" name="intent" value="submit" type="submit" disabled={pending}>
          Submit for review
        </button>
      </div>
    </form>
  );
}
