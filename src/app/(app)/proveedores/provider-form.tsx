"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field, Input, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import {
  createProvider,
  updateProvider,
  type ActionState,
} from "./actions";

const initialState: ActionState = {};

export type ProviderInitial = {
  id: string;
  name: string;
  nit: string | null;
  contactName: string | null;
  contactEmail: string | null;
};

export function ProviderForm({ initial }: { initial?: ProviderInitial }) {
  const isEdit = Boolean(initial);
  const [state, formAction] = useActionState(
    isEdit ? updateProvider : createProvider,
    initialState,
  );
  const close = useModalClose();

  useEffect(() => {
    if (state.ok) {
      toast.success(isEdit ? "Proveedor actualizado." : "Proveedor creado.");
      close();
    }
  }, [state.ok, close, isEdit]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del proveedor" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            defaultValue={initial?.name}
            placeholder="Aliado 1 S.A.S."
          />
        </Field>
        <Field label="NIT" htmlFor="nit">
          <Input
            id="nit"
            name="nit"
            defaultValue={initial?.nit ?? ""}
            placeholder="900123456-7"
          />
        </Field>
        <Field label="Contacto" htmlFor="contactName">
          <Input
            id="contactName"
            name="contactName"
            defaultValue={initial?.contactName ?? ""}
            placeholder="Nombre"
          />
        </Field>
        <Field label="Correo de contacto" htmlFor="contactEmail">
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={initial?.contactEmail ?? ""}
            placeholder="contacto@aliado.com"
          />
        </Field>
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <SubmitButton pendingLabel="Guardando…">
        {isEdit ? "Guardar cambios" : "Agregar proveedor"}
      </SubmitButton>
    </form>
  );
}
