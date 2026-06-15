"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

function Inner({ confirmText }: { confirmText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
      title="Borrar"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </button>
  );
}

/**
 * Delete control: submits a server action with the record id after confirming.
 * `action` is a server action passed from a server component.
 */
export function DeleteButton({
  action,
  id,
  confirmText = "¿Borrar este registro? Esta acción no se puede deshacer.",
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  confirmText?: string;
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <Inner confirmText={confirmText} />
    </form>
  );
}
