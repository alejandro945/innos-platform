import { Search, AlertTriangle, CalendarClock, TrendingDown } from "lucide-react";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  detectPriceAnomalies,
  expiringRates,
  savingsSimulator,
} from "@/lib/analytics";
import { naturalSearch } from "@/lib/nl-search";

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  const orgId = session.organizationId;

  const [anomalies, expiring, simulation, search] = await Promise.all([
    detectPriceAnomalies(orgId),
    expiringRates(orgId, 30),
    savingsSimulator(orgId),
    q ? naturalSearch(orgId, q) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análisis"
        subtitle="Búsqueda inteligente, ahorro potencial, anomalías de precio y vencimientos."
      />

      {/* NL search */}
      <Card>
        <form method="GET" className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Ej: proveedor más barato de quimioterapia vigente hoy"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>

        {search && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-slate-400">
              Interpretado: término “{search.parsed.term ?? "—"}” ·{" "}
              {search.parsed.onlyCurrent ? "vigentes" : "todas"} ·{" "}
              {search.parsed.order === "cheapest"
                ? "más baratas"
                : search.parsed.order === "expensive"
                  ? "más caras"
                  : "más recientes"}
            </p>
            {search.results.length === 0 ? (
              <p className="text-sm text-slate-500">Sin resultados.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {search.results.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs text-slate-500">
                          {r.itemCode}
                        </span>{" "}
                        {r.itemName}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {r.providerName}
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {formatCurrency(r.value)}
                      </td>
                      <td className="py-2 text-xs text-slate-400">
                        {formatDate(r.validFrom)} → {formatDate(r.validTo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {/* Savings simulator */}
      <div>
        <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Ahorro potencial"
            value={formatCurrency(String(simulation.totalSavings))}
            hint="Si adjudicas cada ítem al proveedor más barato"
            icon={TrendingDown}
          />
          <StatCard
            label="Costo al más barato"
            value={formatCurrency(String(simulation.totalBest))}
            hint="Sumando el mejor precio por ítem"
          />
          <StatCard
            label="Costo al promedio"
            value={formatCurrency(String(simulation.totalAvg))}
            hint="Sumando el precio promedio por ítem"
          />
        </div>
        <Card className="p-0">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              Recomendación de adjudicación
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Compara el mismo servicio entre <strong>proveedores distintos</strong>:
              a quién conviene adjudicarlo (el más barato) y cuánto ahorras frente
              al promedio de proveedores. Solo aparecen ítems con 2+ proveedores.
            </p>
          </div>
          {simulation.lines.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">
                Aún no hay nada que recomendar
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Esta recomendación compara <strong>el mismo ítem entre varios
                proveedores</strong>. Necesitas tarifas vigentes de al menos{" "}
                <strong>2 proveedores</strong> para el mismo servicio. Carga el
                tarifario de otro proveedor y vuelve aquí.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-2 font-medium">Ítem</th>
                  <th className="px-5 py-2 text-center font-medium">Provs.</th>
                  <th className="px-5 py-2 font-medium">Adjudicar a</th>
                  <th className="px-5 py-2 text-right font-medium">Mejor precio</th>
                  <th className="px-5 py-2 text-right font-medium">Promedio</th>
                  <th className="px-5 py-2 text-right font-medium">Ahorro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {simulation.lines.map((l) => (
                  <tr key={l.itemCode} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <span className="block font-mono text-[11px] text-slate-400">
                        {l.itemCode}
                      </span>
                      <span className="text-slate-900">{l.itemName}</span>
                    </td>
                    <td className="px-5 py-2.5 text-center text-slate-500">
                      {l.providerCount}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {l.bestProvider}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold text-slate-900">
                      {formatCurrency(l.bestValue)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-400">
                      {formatCurrency(l.avgValue)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-emerald-700">
                      {l.savings > 0 ? `− ${formatCurrency(l.savings)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Anomalies */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Anomalías de precio
            </h2>
          </div>
          {anomalies.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sin desviaciones notables (se requieren ≥3 precios por ítem).
            </p>
          ) : (
            <ul className="space-y-2">
              {anomalies.slice(0, 12).map((a) => (
                <li
                  key={a.rateId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="min-w-0 truncate text-slate-700">
                    {a.itemName} · {a.providerName}
                  </span>
                  <span
                    className={
                      a.kind === "high"
                        ? "ml-2 shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                        : "ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                    }
                  >
                    {formatCurrency(a.value)} ({Math.round(a.ratio * 100)}% mediana)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Expiring */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-blue-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Vencen en 30 días
            </h2>
          </div>
          {expiring.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ninguna tarifa vigente vence pronto.
            </p>
          ) : (
            <ul className="space-y-2">
              {expiring.slice(0, 12).map((e) => (
                <li
                  key={e.rateId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="min-w-0 truncate text-slate-700">
                    {e.itemName} · {e.providerName}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-slate-500">
                    {formatDate(e.validTo)} ({e.daysLeft} días)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
