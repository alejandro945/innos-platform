"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, Select, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import { uploadAndParse, type ActionState } from "../actions";

const initialState: ActionState = {};

// Must stay below the Server Action bodySizeLimit (next.config.ts): a request
// over that limit is rejected with a 413 before the action runs, and the form
// would hang in "pending" with no error.
const MAX_FILE_MB = 20;

export function UploadForm({
  processId,
  providers,
}: {
  processId: string;
  providers: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(uploadAndParse, initialState);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const close = useModalClose();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      close();
    }
  }, [state.ok, close]);

  if (providers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Registre un proveedor antes de cargar archivos.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        const input = e.currentTarget.elements.namedItem(
          "file",
        ) as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
          e.preventDefault();
          setSizeError(
            `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${MAX_FILE_MB} MB. Divida el tarifario o elimine hojas/columnas innecesarias.`,
          );
          return;
        }
        setSizeError(null);
      }}
      className="space-y-4"
    >
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
      {(sizeError || state.error) && (
        <p className="text-sm text-rose-600">{sizeError ?? state.error}</p>
      )}
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
