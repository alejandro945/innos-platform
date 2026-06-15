"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ComboOption } from "@/components/combobox";
import { ReviewRow, type ReviewItem } from "./review-row";
import {
  approveAllHighConfidence,
  approveSelected,
  bulkCreateAndApproveNoMatch,
} from "./actions";

export function ReviewList({
  items,
  options,
  proceso,
  highConfidenceCount,
  noMatchCount,
}: {
  items: ReviewItem[];
  options: ComboOption[];
  proceso?: string;
  highConfidenceCount: number;
  noMatchCount: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const bulk = (
    fn: (fd: FormData) => Promise<{ ok: boolean; message?: string }>,
    fields: Record<string, string>,
  ) => {
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      const res = await fn(fd);
      if (res.ok) {
        toast.success(res.message ?? "Listo.");
        setSelected(new Set());
      } else toast.error(res.message ?? "No se pudo completar.");
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <span className="text-sm text-slate-600">
          {items.length} por revisar
          {selected.size > 0 && ` · ${selected.size} seleccionados`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                bulk(approveSelected, { ids: [...selected].join(",") })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Aprobar seleccionados ({selected.size})
            </button>
          )}
          <button
            type="button"
            disabled={pending || highConfidenceCount === 0}
            onClick={() =>
              bulk(approveAllHighConfidence, proceso ? { proceso } : {})
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Aprueba todas las de confianza ≥ 90% con coincidencia"
          >
            Aprobar alta confianza ({highConfidenceCount})
          </button>
          <button
            type="button"
            disabled={pending || noMatchCount === 0}
            onClick={() =>
              bulk(bulkCreateAndApproveNoMatch, proceso ? { proceso } : {})
            }
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            title="Crea un ítem canónico nuevo para cada 'sin coincidencia' y lo aprueba"
          >
            Crear + aprobar sin-match ({noMatchCount})
          </button>
        </div>
      </div>

      {items.map((item) => (
        <ReviewRow
          key={item.mappingId}
          item={item}
          options={options}
          selected={selected.has(item.mappingId)}
          onToggle={(c) => toggle(item.mappingId, c)}
        />
      ))}
    </div>
  );
}
