"use client";

import { useActionState } from "react";
import { Field, Input, Textarea, SubmitButton } from "@/components/form";
import { createProcess, type ActionState } from "./actions";

const initialState: ActionState = {};

export function ProcessForm() {
  const [state, formAction] = useActionState(createProcess, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nombre del proceso" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          placeholder="Contratación oncología 2026"
        />
      </Field>
      <Field label="Descripción" htmlFor="description" hint="Opcional">
        <Textarea id="description" name="description" rows={2} />
      </Field>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <SubmitButton pendingLabel="Creando…">Crear proceso</SubmitButton>
    </form>
  );
}
