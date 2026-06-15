import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { ComparisonView } from "@/components/comparison-view";
import { PrintButton } from "@/components/print-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { getLatestComparison } from "@/lib/comparison";

export default async function ReportePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const comparison = await getLatestComparison(id, session.organizationId);
  if (!comparison) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Reporte de comparación de tarifas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {comparison.processName} · INOOS SAS
          </p>
          <p className="text-xs text-slate-400">
            Generado el {formatDate(comparison.generatedAt)}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-slate-500">Ítems comparados</p>
          <p className="text-lg font-semibold text-slate-900">
            {comparison.lines.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-slate-500">Ahorro potencial</p>
          <p className="text-lg font-semibold text-emerald-700">
            {formatCurrency(String(comparison.totalSavings))}
          </p>
        </div>
      </div>

      <ComparisonView lines={comparison.lines} />

      <p className="mt-8 text-xs text-slate-400">
        Documento generado por la plataforma de comparación de tarifas de INOOS.
        El ahorro potencial corresponde a la suma de (máximo − mínimo) por ítem.
      </p>
    </div>
  );
}
