"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, Textarea, Select, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import { ITEM_KINDS, ITEM_KIND_LABELS } from "@/lib/constants";
import { createCanonicalItem, type ActionState } from "./actions";

const initialState: ActionState = {};

export function ItemForm() {
  const [state, formAction] = useActionState(createCanonicalItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const close = useModalClose();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      close();
    }
  }, [state.ok, close]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="SERVICE">
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CUPS propio" htmlFor="canonicalCode">
          <Input id="canonicalCode" name="canonicalCode" required placeholder="INO-QT-01" />
        </Field>
        <Field label="CUPS normativo (SISPRO)" htmlFor="normativeCode">
          <Input id="normativeCode" name="normativeCode" placeholder="902100" />
        </Field>
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" required placeholder="Sesión QT ambulatoria" />
        </Field>
      </div>

      <Field label="Descripción específica" htmlFor="description">
        <Textarea id="description" name="description" rows={2} />
      </Field>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="includesFees" className="h-4 w-4" />
          Incluye honorarios
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="includesSupplies" className="h-4 w-4" />
          Incluye insumos
        </label>
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Ítem creado.</p>}

      <SubmitButton>Agregar ítem</SubmitButton>
    </form>
  );
}
