"use client";

import { useState, useTransition, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import { Field } from "@/components/form";
import { createRegulatoryUpdateFromBlob } from "./actions";

export function UploadResolutionForm() {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError("Seleccione un archivo PDF.");
      return;
    }
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("El archivo debe ser un PDF.");
      return;
    }

    startTransition(async () => {
      try {
        setProgress(0);
        // Uploads straight from the browser to Blob storage — a Server
        // Action's own request body is capped at 1MB, far too small for a
        // multi-MB resolution PDF.
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/actualizaciones-cups/upload-blob",
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        });
        const result = await createRegulatoryUpdateFromBlob(file.name, blob.url);
        if (result?.error) setError(result.error);
        // On success the action redirects; this component unmounts.
      } catch (err) {
        setError((err as Error).message || "No se pudo subir el archivo.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Resolución (PDF)"
        htmlFor="file"
        hint="Documento del Ministerio de Salud con la actualización de códigos CUPS. Hasta 50 MB."
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          disabled={pending}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 disabled:opacity-60"
        />
      </Field>
      {pending && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {progress < 100 ? `Subiendo… ${progress}%` : "Analizando con IA…"}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Subiendo…" : "Cargar resolución"}
      </button>
    </form>
  );
}
