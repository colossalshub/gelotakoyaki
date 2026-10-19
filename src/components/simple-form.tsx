"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";

export function SimpleForm({
  action,
  fields,
  submit,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Array<{ name: string; label: string; type?: string }>;
  submit: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-2">
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {fields.map((field) => (
        <label key={field.name} className="field">
          <span>{field.label}</span>
          <input className="control" name={field.name} type={field.type ?? "text"} />
        </label>
      ))}
      <button className="btn" type="submit" disabled={pending}>{submit}</button>
    </form>
  );
}
