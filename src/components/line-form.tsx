"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { FormState } from "@/actions/types";

export type ClientItem = {
  id: string;
  sku: string;
  name: string;
  baseUnitId: string;
  baseUnitCode: string;
  purchaseUnitId: string;
  purchaseUnitCode: string;
  tracksBatch?: boolean;
  tracksExpiry?: boolean;
};

type Draft = {
  key: string;
  itemId: string;
  quantity: string;
  unitId: string;
  unitCost: string;
  damaged: string;
  rejected: string;
  reason: string;
  notes: string;
  lotCode: string;
  expiryDate: string;
};

const blank = (): Draft => ({
  key: crypto.randomUUID(),
  itemId: "",
  quantity: "",
  unitId: "",
  unitCost: "",
  damaged: "",
  rejected: "",
  reason: "",
  notes: "",
  lotCode: "",
  expiryDate: "",
});

export function LineForm({
  action,
  items,
  units,
  branches,
  title,
  confirm,
  showCost = false,
  showDamage = false,
  showReason = false,
  reasons = [],
  showLot = false,
  extra,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  items: ClientItem[];
  units: Array<{ id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string }>;
  title: string;
  confirm: string;
  showCost?: boolean;
  showDamage?: boolean;
  showReason?: boolean;
  reasons?: Array<{ code: string; label: string }>;
  showLot?: boolean;
  extra?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 8);
    return items
      .filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [items, query]);
  const selected = items.find((item) => item.id === draft.itemId);

  function addLine() {
    if (!draft.itemId || !draft.quantity || !draft.unitId) return;
    setLines((current) => [...current, draft]);
    setDraft(blank());
    setQuery("");
  }

  return (
    <form id="movement-form" action={formAction} className="grid gap-4">
      {state.error ? <div className="banner banner-bad" role="alert">{state.error}</div> : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitId: line.unitId, unitCost: line.unitCost, damaged: line.damaged, rejected: line.rejected, reason: line.reason, notes: line.notes, lotCode: line.lotCode, expiryDate: line.expiryDate })))} />
      <label className="field">
        <span>Branch</span>
        <select className="control" name="branchId" required defaultValue={branches.length === 1 ? branches[0]?.id : ""}>
          <option value="">Choose a branch</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </option>
          ))}
        </select>
      </label>
      {extra}
      <section className="card p-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <label className="field mt-3">
          <span>Find an item</span>
          <input className="control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or SKU" />
        </label>
        <ul className="mt-2 divide-y divide-line border border-line">
          {matches.map((item) => (
            <li key={item.id}>
              <button
                className="flex min-h-11 w-full items-center justify-between px-3 text-left"
                type="button"
                onClick={() => {
                  setDraft((current) => ({ ...current, itemId: item.id, unitId: item.baseUnitId }));
                  setQuery(`${item.sku} ${item.name}`);
                }}
              >
                <span>{item.name}</span>
                <span className="num text-sm text-muted">{item.sku}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 ? <li className="px-3 py-3 text-sm text-muted">No matching items.</li> : null}
        </ul>
        {selected ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span>Quantity</span>
              <input className="control num" inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
            </label>
            <label className="field">
              <span>Unit</span>
              <select className="control" value={draft.unitId} onChange={(event) => setDraft({ ...draft, unitId: event.target.value })}>
                {units
                  .filter((unit) => unit.id === selected.baseUnitId || unit.id === selected.purchaseUnitId)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} · {unit.name}
                    </option>
                  ))}
              </select>
            </label>
            {showCost ? (
              <label className="field">
                <span>Unit cost (optional, per entered unit)</span>
                <input className="control num" inputMode="decimal" value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} />
              </label>
            ) : null}
            {showDamage ? (
              <>
                <label className="field">
                  <span>Damaged</span>
                  <input className="control num" inputMode="decimal" value={draft.damaged} onChange={(event) => setDraft({ ...draft, damaged: event.target.value })} />
                </label>
                <label className="field">
                  <span>Rejected</span>
                  <input className="control num" inputMode="decimal" value={draft.rejected} onChange={(event) => setDraft({ ...draft, rejected: event.target.value })} />
                </label>
              </>
            ) : null}
            {showReason ? (
              <label className="field">
                <span>Reason</span>
                <select className="control" value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })}>
                  <option value="">Choose</option>
                  {reasons.map((reason) => (
                    <option key={reason.code} value={reason.code}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {showLot || selected.tracksBatch || selected.tracksExpiry ? (
              <>
                <label className="field">
                  <span>Lot code {selected.tracksBatch ? "(required)" : "(optional)"}</span>
                  <input className="control" value={draft.lotCode} onChange={(event) => setDraft({ ...draft, lotCode: event.target.value })} />
                </label>
                <label className="field">
                  <span>Expiry {selected.tracksExpiry ? "(required)" : "(optional)"}</span>
                  <input className="control" type="date" value={draft.expiryDate} onChange={(event) => setDraft({ ...draft, expiryDate: event.target.value })} />
                </label>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <button className="btn" type="button" onClick={addLine}>
                Add line
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <section className="card">
        {lines.length === 0 ? (
          <p className="p-4 text-sm text-muted">No lines yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const item = items.find((entry) => entry.id === line.itemId);
                  const unit = units.find((entry) => entry.id === line.unitId);
                  return (
                    <tr key={line.key}>
                      <td>{item?.name}</td>
                      <td className="num">
                        {line.quantity} {unit?.code}
                      </td>
                      <td>
                        <button className="btn btn-small" type="button" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <label className="field">
        <span>Notes</span>
        <textarea className="control min-h-20" name="notes" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="button" disabled={pending || lines.length === 0} onClick={() => dialogRef.current?.showModal()}>
          {pending ? "Posting…" : "Review and post"}
        </button>
      </div>
      <dialog ref={dialogRef} className="w-[min(32rem,calc(100%-2rem))] border border-line bg-paper p-5 text-ink backdrop:bg-black/40">
        <h2 className="text-lg font-semibold">Post this record?</h2>
        <p className="mt-2 text-sm text-muted">{confirm}</p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Posting…" : "Post"}
          </button>
          <button className="btn" type="button" onClick={() => dialogRef.current?.close()}>
            Back
          </button>
        </div>
      </dialog>
    </form>
  );
}
