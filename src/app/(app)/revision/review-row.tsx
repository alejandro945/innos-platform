"use client";

import { Select } from "@/components/form";
import { ConfidenceBadge } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { formatCurrency } from "@/lib/format";
import {
  approveMapping,
  rejectMapping,
  createCanonicalAndApprove,
} from "./actions";

export type ReviewItem = {
  mappingId: string;
  rawName: string;
  rawCode: string | null;
  rawPrice: string | null;
  providerName: string;
  confidence: number;
  rationale: string | null;
  suggestedId: string | null;
};

export function ReviewRow({
  item,
  options,
}: {
  item: ReviewItem;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {/* Provider item (left) */}
        <div className="min-w-0 flex-1">
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
        </div>

        {/* Decision (right) */}
        <div className="flex w-full flex-col gap-2 md:w-96">
          <form action={approveMapping} className="flex flex-col gap-2">
            <input type="hidden" name="mappingId" value={item.mappingId} />
            <Select
              name="canonicalItemId"
              defaultValue={item.suggestedId ?? ""}
            >
              <option value="" disabled>
                Seleccione ítem canónico…
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            <ActionButton variant="primary" full>
              Aprobar homologación
            </ActionButton>
          </form>
          <form action={createCanonicalAndApprove}>
            <input type="hidden" name="mappingId" value={item.mappingId} />
            <ActionButton
              variant="secondary"
              full
              className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            >
              + Crear ítem canónico y aprobar
            </ActionButton>
          </form>
          <form action={rejectMapping}>
            <input type="hidden" name="mappingId" value={item.mappingId} />
            <ActionButton variant="secondary" full>
              Sin coincidencia
            </ActionButton>
          </form>
        </div>
      </div>
    </div>
  );
}
