"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ConfidenceBadge } from "@/components/ui";
import { Combobox, type ComboOption } from "@/components/combobox";
import { formatCurrency } from "@/lib/format";
import {
  approveMapping,
  rejectMapping,
  createCanonicalAndApprove,
} from "./actions";

export type Candidate = { id: string; name: string; score: number };

export type ReviewItem = {
  mappingId: string;
  rawName: string;
  rawCode: string | null;
  rawPrice: string | null;
  providerName: string;
  confidence: number;
  rationale: string | null;
  suggestedId: string | null;
  candidates: Candidate[];
};

export function ReviewRow({
  item,
  options,
  selected,
  onToggle,
}: {
  item: ReviewItem;
  options: ComboOption[];
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const [chosenId, setChosenId] = useState<string | null>(item.suggestedId);
  const [pending, startTransition] = useTransition();

  const run = (
    fn: (fd: FormData) => Promise<{ ok: boolean; message?: string }>,
    extra?: Record<string, string>,
  ) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("mappingId", item.mappingId);
      for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
      const res = await fn(fd);
      if (res.ok) toast.success(res.message ?? "Listo.");
      else toast.error(res.message ?? "No se pudo completar.");
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {/* Provider item (left) */}
        <div className="flex min-w-0 flex-1 gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
            aria-label="Seleccionar"
          />
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{item.rawName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.providerName}
              {item.rawCode ? ` · cód. ${item.rawCode}` : ""}
              {item.rawPrice ? ` · ${formatCurrency(item.rawPrice)}` : ""}
            </p>
            <div className="mt-2">
              <ConfidenceBadge value={item.confidence} />
            </div>
            {item.rationale && (
              <p className="mt-2 text-xs text-slate-500">{item.rationale}</p>
            )}
            {item.candidates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-xs text-slate-400">Sugeridos IA:</span>
                {item.candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChosenId(c.id)}
                    className={`rounded-full border px-2 py-0.5 text-xs transition ${
                      chosenId === c.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {c.name} · {Math.round(c.score * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Decision (right) */}
        <div className="flex w-full flex-col gap-2 md:w-96">
          <Combobox options={options} value={chosenId} onChange={setChosenId} />
          <button
            type="button"
            disabled={pending || !chosenId}
            onClick={() =>
              run(approveMapping, { canonicalItemId: chosenId ?? "" })
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Aprobar homologación
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(createCanonicalAndApprove)}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            + Crear ítem canónico y aprobar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(rejectMapping)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Sin coincidencia
          </button>
        </div>
      </div>
    </div>
  );
}
