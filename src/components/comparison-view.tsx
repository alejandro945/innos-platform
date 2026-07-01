import { formatCurrency } from "@/lib/format";
import type { StoredLineOptions } from "@/lib/comparison";
import { cn } from "@/lib/utils";

export type ComparisonLineRow = {
  id: string;
  minValue: string | null;
  maxValue: string | null;
  avgValue: string | null;
  bestProviderId: string | null;
  optionCount: number;
  data: StoredLineOptions;
};

/** Keep only the cheapest option per provider. */
function dedupeByProvider(options: StoredLineOptions["options"]) {
  const best = new Map<string, (typeof options)[number]>();
  for (const o of options) {
    const cur = best.get(o.providerId);
    if (!cur || (o.value ?? Infinity) < (cur.value ?? Infinity)) {
      best.set(o.providerId, o);
    }
  }
  return [...best.values()];
}

export function ComparisonView({
  lines,
  dedupe = false,
}: {
  lines: ComparisonLineRow[];
  dedupe?: boolean;
}) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No hay ítems homologados y aprobados para comparar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {lines.map((line) => {
        const grouped = line.data.internalItems.length > 1;
        return (
        <div
          key={line.id}
          className="overflow-hidden rounded-xl border border-slate-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              {line.data.normativeCode && (
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  CUPS normativo
                </span>
              )}
              <span className="font-mono text-xs text-slate-500">
                {line.data.canonicalCode}
              </span>
              <span className="ml-2 font-medium text-slate-900">
                {line.data.canonicalName}
              </span>
              {grouped && (
                <div className="mt-1 text-xs text-amber-700">
                  Agrupa {line.data.internalItems.length} ítems del catálogo
                  propio ({line.data.internalItems.map((i) => i.canonicalCode).join(", ")}
                  ) — considera fusionarlos en{" "}
                  <a href="/analisis" className="underline">
                    Catálogo
                  </a>
                  .
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              <span>Mín: <strong>{formatCurrency(line.minValue)}</strong></span>
              <span>Máx: {formatCurrency(line.maxValue)}</span>
              <span>Prom: {formatCurrency(line.avgValue)}</span>
              {line.data.savings ? (
                <span className="text-emerald-700">
                  Ahorro: {formatCurrency(String(line.data.savings))}
                </span>
              ) : null}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Proveedor</th>
                {grouped && (
                  <th className="px-4 py-2 font-medium">Ítem interno</th>
                )}
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Inclusiones</th>
                <th className="px-4 py-2 font-medium">Exclusiones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dedupe ? dedupeByProvider(line.data.options) : line.data.options)
                .slice()
                .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))
                .map((opt, i) => {
                  // Sorted ascending: only the first priced row is the best.
                  const isBest = i === 0 && opt.value !== null;
                  return (
                    <tr key={`${opt.providerId}-${i}`} className={cn(isBest && "bg-emerald-50")}>
                      <td className="px-4 py-2 text-slate-900">
                        {opt.providerName}
                        {isBest && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Mejor precio
                          </span>
                        )}
                      </td>
                      {grouped && (
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">
                          {opt.internalCode}
                        </td>
                      )}
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {formatCurrency(opt.value)}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {opt.inclusions ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {opt.exclusions ?? "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        );
      })}
    </div>
  );
}
