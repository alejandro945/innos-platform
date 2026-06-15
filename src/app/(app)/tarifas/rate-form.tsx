"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, Textarea, Select, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import { createRate, updateRate, type ActionState } from "./actions";

const initialState: ActionState = {};

type Option = { id: string; label: string };

export type RateInitial = {
  id: string;
  itemLabel: string;
  providerLabel: string;
  tariffSource: string | null;
  value: string;
  exclusions: string | null;
  validFrom: string; // yyyy-mm-dd
  validTo: string; // yyyy-mm-dd or ""
};

export function RateForm({
  items,
  providers,
  initial,
}: {
  items?: Option[];
  providers?: Option[];
  initial?: RateInitial;
}) {
  const isEdit = Boolean(initial);
  const [state, formAction] = useActionState(
    isEdit ? updateRate : createRate,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const close = useModalClose();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      close();
    }
  }, [state.ok, close]);

  if (!isEdit && (!items?.length || !providers?.length)) {
    return (
      <p className="text-sm text-slate-500">
        Primero registre al menos un ítem en el catálogo y un proveedor.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isEdit ? (
          <>
            <Field label="Ítem canónico">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {initial!.itemLabel}
              </p>
            </Field>
            <Field label="Proveedor">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {initial!.providerLabel}
              </p>
            </Field>
          </>
        ) : (
          <>
            <Field label="Ítem canónico" htmlFor="canonicalItemId">
              <Select id="canonicalItemId" name="canonicalItemId" defaultValue="">
                <option value="" disabled>
                  Seleccione…
                </option>
                {items!.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Proveedor" htmlFor="providerId">
              <Select id="providerId" name="providerId" defaultValue="">
                <option value="" disabled>
                  Seleccione…
                </option>
                {providers!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field label="Tarifario / contratista" htmlFor="tariffSource">
          <Input
            id="tariffSource"
            name="tariffSource"
            defaultValue={initial?.tariffSource ?? ""}
            placeholder="Tarifario A"
          />
        </Field>
        <Field label="Valor (COP)" htmlFor="value">
          <Input
            id="value"
            name="value"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={initial?.value ?? ""}
          />
        </Field>
        <Field label="Vigencia desde" htmlFor="validFrom">
          <Input
            id="validFrom"
            name="validFrom"
            type="date"
            required
            defaultValue={initial?.validFrom ?? ""}
          />
        </Field>
        <Field label="Vigencia hasta" htmlFor="validTo" hint="Opcional">
          <Input
            id="validTo"
            name="validTo"
            type="date"
            defaultValue={initial?.validTo ?? ""}
          />
        </Field>
      </div>

      <Field label="Exclusiones" htmlFor="exclusions">
        <Textarea
          id="exclusions"
          name="exclusions"
          rows={2}
          defaultValue={initial?.exclusions ?? ""}
          placeholder="No incluye medicamentos…"
        />
      </Field>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <SubmitButton pendingLabel="Guardando…">
        {isEdit ? "Guardar cambios" : "Agregar tarifa"}
      </SubmitButton>
    </form>
  );
}
