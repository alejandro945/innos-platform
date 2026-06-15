"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, Textarea, Select, SubmitButton } from "@/components/form";
import { createRate, type ActionState } from "./actions";

const initialState: ActionState = {};

type Option = { id: string; label: string };

export function RateForm({
  items,
  providers,
}: {
  items: Option[];
  providers: Option[];
}) {
  const [state, formAction] = useActionState(createRate, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  if (items.length === 0 || providers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Primero registre al menos un ítem en el catálogo y un proveedor.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Ítem canónico" htmlFor="canonicalItemId">
          <Select id="canonicalItemId" name="canonicalItemId" defaultValue="">
            <option value="" disabled>
              Seleccione…
            </option>
            {items.map((i) => (
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
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tarifario / contratista" htmlFor="tariffSource">
          <Input id="tariffSource" name="tariffSource" placeholder="Tarifario A" />
        </Field>
        <Field label="Valor (COP)" htmlFor="value">
          <Input id="value" name="value" type="number" min="0" step="1" required />
        </Field>
        <Field label="Vigencia desde" htmlFor="validFrom">
          <Input id="validFrom" name="validFrom" type="date" required />
        </Field>
        <Field label="Vigencia hasta" htmlFor="validTo" hint="Opcional">
          <Input id="validTo" name="validTo" type="date" />
        </Field>
      </div>

      <Field label="Exclusiones" htmlFor="exclusions">
        <Textarea id="exclusions" name="exclusions" rows={2} placeholder="No incluye medicamentos…" />
      </Field>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Tarifa registrada.</p>}

      <SubmitButton>Agregar tarifa</SubmitButton>
    </form>
  );
}
