"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, Input, SubmitButton } from "@/components/form";
import { createProvider, type ActionState } from "./actions";

const initialState: ActionState = {};

export function ProviderForm() {
  const [state, formAction] = useActionState(createProvider, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del proveedor" htmlFor="name">
          <Input id="name" name="name" required placeholder="Aliado 1 S.A.S." />
        </Field>
        <Field label="NIT" htmlFor="nit">
          <Input id="nit" name="nit" placeholder="900123456-7" />
        </Field>
        <Field label="Contacto" htmlFor="contactName">
          <Input id="contactName" name="contactName" placeholder="Nombre" />
        </Field>
        <Field label="Correo de contacto" htmlFor="contactEmail">
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            placeholder="contacto@aliado.com"
          />
        </Field>
      </div>

      {state.error && (
        <p className="text-sm text-rose-600">{state.error}</p>
      )}
      {state.ok && (
        <p className="text-sm text-emerald-600">Proveedor creado.</p>
      )}

      <SubmitButton>Agregar proveedor</SubmitButton>
    </form>
  );
}
