"use client";

import { useActionState } from "react";
import { Field, SubmitButton } from "@/components/form";
import { uploadRegulatoryUpdate, type ActionState } from "./actions";

const initialState: ActionState = {};

export function UploadResolutionForm() {
  const [state, formAction] = useActionState(uploadRegulatoryUpdate, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Resolución (PDF)"
        htmlFor="file"
        hint="Documento del Ministerio de Salud con la actualización de códigos CUPS."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
        />
      </Field>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <SubmitButton pendingLabel="Subiendo y analizando…">
        Cargar resolución
      </SubmitButton>
    </form>
  );
}
