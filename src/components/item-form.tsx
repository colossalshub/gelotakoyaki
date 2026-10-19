"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function ItemForm({
  action,
  categories,
  units,
  suppliers,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: Array<{ id: string; name: string }>;
  units: Array<{ id: string; code: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      {state.error ? <p className="banner banner-bad">{state.error}</p> : null}
      <label className="field"><span>SKU</span><input className="control" name="sku" required /></label>
      <label className="field"><span>Name</span><input className="control" name="name" required /></label>
      <label className="field"><span>Description</span><input className="control" name="description" /></label>
      <label className="field">
        <span>Category</span>
        <select className="control" name="categoryId" required>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Base unit</span>
        <select className="control" name="baseUnitId" required>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Purchase unit</span>
        <select className="control" name="purchaseUnitId" required>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Explicit conversion, only if the units are different families</span>
        <input className="control" name="purchaseToBaseFactor" inputMode="decimal" />
      </label>
      <label className="field">
        <span>Supplier</span>
        <select className="control" name="supplierId" defaultValue="">
          <option value="">None</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Purchase cost</span><input className="control" name="purchaseCost" inputMode="decimal" /></label>
      <label className="field"><span>Default reorder point</span><input className="control" name="defaultReorderPoint" inputMode="decimal" defaultValue="0" /></label>
      <label className="field"><span>Default target</span><input className="control" name="defaultTargetLevel" inputMode="decimal" defaultValue="0" /></label>
      <label className="field"><span>Storage location</span><input className="control" name="storageLocation" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tracksBatch" /> Track lot or batch</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tracksExpiry" /> Track expiry</label>
      <button className="btn btn-primary" disabled={pending} type="submit">Save item</button>
    </form>
  );
}
