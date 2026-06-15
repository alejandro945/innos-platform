"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Field, Input, Textarea, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import { createProcess, updateProcess, type ActionState } from "./actions";

const initialState: ActionState = {};

export function ProcessForm({
  initial,
}: {
  initial?: { id: string; name: string; description: string | null };
}) {
  const isEdit = Boolean(initial);
  const action = isEdit ? updateProcess : createProcess;
  const [state, formAction] = useActionState(action, initialState);
  const close = useModalClose();

  useEffect(() => {
    if (state.ok) {
      toast.success("Proceso actualizado.");
      close();
    }
  }, [state.ok, close]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Nombre del proceso" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="Contratación oncología 2026"
        />
      </Field>
      <Field label="Descripción" htmlFor="description" hint="Opcional">
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={initial?.description ?? ""}
        />
      </Field>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <SubmitButton pendingLabel={isEdit ? "Guardando…" : "Creando…"}>
        {isEdit ? "Guardar cambios" : "Crear proceso"}
      </SubmitButton>
    </form>
  );
}
