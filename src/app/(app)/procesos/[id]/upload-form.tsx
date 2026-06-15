"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Select, SubmitButton } from "@/components/form";
import { uploadAndParse, type ActionState } from "../actions";

const initialState: ActionState = {};

export function UploadForm({
  processId,
  providers,
}: {
  processId: string;
  providers: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(uploadAndParse, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (providers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Registre un proveedor antes de cargar archivos.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="processId" value={processId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Proveedor" htmlFor="providerId">
          <Select id="providerId" name="providerId" defaultValue="">
            <option value="" disabled>
              Seleccione…
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Archivo (Excel o CSV)" htmlFor="file">
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
        </Field>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600">
          Archivo cargado y analizado. Confirme el mapeo de columnas abajo.
        </p>
      )}
      <SubmitButton pendingLabel="Procesando archivo…">
        Cargar y analizar
      </SubmitButton>
    </form>
  );
}
