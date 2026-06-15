"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, Textarea, Select, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import { ITEM_KINDS, ITEM_KIND_LABELS } from "@/lib/constants";
import type { ItemKind } from "@prisma/client";
import {
  createCanonicalItem,
  updateCanonicalItem,
  type ActionState,
} from "./actions";

const initialState: ActionState = {};

export type ItemInitial = {
  id: string;
  kind: ItemKind;
  canonicalCode: string;
  normativeCode: string | null;
  name: string;
  description: string | null;
  includesFees: boolean;
  includesSupplies: boolean;
};

export function ItemForm({ initial }: { initial?: ItemInitial }) {
  const isEdit = Boolean(initial);
  const [state, formAction] = useActionState(
    isEdit ? updateCanonicalItem : createCanonicalItem,
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

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={initial?.kind ?? "SERVICE"}>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CUPS propio" htmlFor="canonicalCode">
          <Input
            id="canonicalCode"
            name="canonicalCode"
            required
            defaultValue={initial?.canonicalCode}
            placeholder="INO-QT-01"
          />
        </Field>
        <Field label="CUPS normativo (SISPRO)" htmlFor="normativeCode">
          <Input
            id="normativeCode"
            name="normativeCode"
            defaultValue={initial?.normativeCode ?? ""}
            placeholder="902100"
          />
        </Field>
        <Field label="Nombre" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            defaultValue={initial?.name}
            placeholder="Sesión QT ambulatoria"
          />
        </Field>
      </div>

      <Field label="Descripción específica" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={initial?.description ?? ""}
        />
      </Field>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="includesFees"
            className="h-4 w-4"
            defaultChecked={initial?.includesFees}
          />
          Incluye honorarios
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="includesSupplies"
            className="h-4 w-4"
            defaultChecked={initial?.includesSupplies}
          />
          Incluye insumos
        </label>
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <SubmitButton pendingLabel="Guardando…">
        {isEdit ? "Guardar cambios" : "Agregar ítem"}
      </SubmitButton>
    </form>
  );
}
