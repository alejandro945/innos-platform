"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { upload } from "@vercel/blob/client";
import { Field, Select, SubmitButton } from "@/components/form";
import { useModalClose } from "@/components/modal";
import {
  uploadAndParse,
  uploadAndParseFromBlob,
  type ActionState,
} from "../actions";

const initialState: ActionState = {};

// Fallback (no Blob storage) goes through the Server Action body, which is
// capped by next.config.ts — a request over that limit is rejected with a 413
// before the action runs, and the form would hang in "pending" with no error.
const MAX_ACTION_FILE_MB = 20;
// Blob client uploads are capped by /api/procesos/upload-blob.
const MAX_BLOB_FILE_MB = 50;

export function UploadForm({
  processId,
  providers,
  blobEnabled,
}: {
  processId: string;
  providers: { id: string; label: string }[];
  blobEnabled?: boolean;
}) {
  const [state, formAction] = useActionState(uploadAndParse, initialState);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [pending, startTransition] = useTransition();
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

  const maxMb = blobEnabled ? MAX_BLOB_FILE_MB : MAX_ACTION_FILE_MB;

  function readForm(form: HTMLFormElement) {
    const providerId =
      (form.elements.namedItem("providerId") as HTMLSelectElement | null)
        ?.value ?? "";
    const file =
      (form.elements.namedItem("file") as HTMLInputElement | null)
        ?.files?.[0] ?? null;
    return { providerId, file };
  }

  function validate(file: File | null, providerId: string): string | null {
    if (!providerId) return "Seleccione un proveedor.";
    if (!file) return "Seleccione un archivo.";
    if (file.size > maxMb * 1024 * 1024) {
      return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${maxMb} MB. Divida el tarifario o elimine hojas/columnas innecesarias.`;
    }
    return null;
  }

  // Primary path: upload straight from the browser to Blob storage, then pass
  // only the URL through the Server Action (its body is too small for real
  // tariff files).
  function handleBlobSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const { providerId, file } = readForm(form);
    const invalid = validate(file, providerId);
    if (invalid) {
      setError(invalid);
      return;
    }

    startTransition(async () => {
      try {
        setProgress(0);
        const blob = await upload(file!.name, file!, {
          access: "public",
          handleUploadUrl: "/api/procesos/upload-blob",
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        });
        const result = await uploadAndParseFromBlob(
          processId,
          providerId,
          file!.name,
          blob.url,
        );
        if (result.error) {
          setError(result.error);
          return;
        }
        form.reset();
        close();
      } catch (err) {
        setError((err as Error).message || "No se pudo subir el archivo.");
      }
    });
  }

  // Fallback path (no Blob storage, e.g. local dev): the file itself goes
  // through the Server Action. Guard the size client-side so an oversized
  // file shows an error instead of an eternal spinner.
  function handleActionSubmit(e: FormEvent<HTMLFormElement>) {
    const { providerId, file } = readForm(e.currentTarget);
    const invalid = validate(file, providerId);
    if (invalid) {
      e.preventDefault();
      setError(invalid);
      return;
    }
    setError(null);
  }

  return (
    <form
      ref={formRef}
      action={blobEnabled ? undefined : formAction}
      onSubmit={blobEnabled ? handleBlobSubmit : handleActionSubmit}
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
            disabled={pending}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 disabled:opacity-60"
          />
        </Field>
      </div>
      {pending && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {progress < 100 ? `Subiendo… ${progress}%` : "Analizando columnas…"}
          </p>
        </div>
      )}
      {(error || state.error) && (
        <p className="text-sm text-rose-600">{error ?? state.error}</p>
      )}
      {blobEnabled ? (
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Procesando archivo…" : "Cargar y analizar"}
        </button>
      ) : (
        <SubmitButton pendingLabel="Procesando archivo…">
          Cargar y analizar
        </SubmitButton>
      )}
    </form>
  );
}
