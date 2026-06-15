import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer, RefreshCw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { ComparisonView } from "@/components/comparison-view";
import { formatCurrency, formatDate } from "@/lib/format";
import { getLatestComparison } from "@/lib/comparison";
import { createComparison } from "../../actions";

export default async function ComparacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROCUREMENT_ANALYST");

  const process = await prisma.procurementProcess.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true, name: true },
  });
  if (!process) notFound();

  const comparison = await getLatestComparison(id, session.organizationId);

  return (
    <div>
      <PageHeader
        title="Comparación"
        subtitle={process.name}
        action={
          <Link
            href={`/procesos/${id}`}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Volver al proceso
          </Link>
        }
      />

      {!comparison ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-base font-medium text-slate-900">
            Sin comparación generada
          </h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Genere la comparación con los ítems homologados y aprobados de este
            proceso.
          </p>
          {canManage && (
            <form action={createComparison} className="mt-4">
              <input type="hidden" name="processId" value={id} />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Generar comparación
              </button>
            </form>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Ítems comparados"
              value={String(comparison.lines.length)}
            />
            <StatCard
              label="Ahorro potencial"
              value={formatCurrency(String(comparison.totalSavings))}
              hint="Suma de (máx − mín) por ítem"
            />
            <StatCard
              label="Generada"
              value={formatDate(comparison.generatedAt)}
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <a
              href={`/procesos/${id}/comparacion/export`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </a>
            <Link
              href={`/procesos/${id}/comparacion/reporte`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> Reporte / PDF
            </Link>
            {canManage && (
              <form action={createComparison}>
                <input type="hidden" name="processId" value={id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" /> Regenerar
                </button>
              </form>
            )}
          </div>

          <ComparisonView lines={comparison.lines} />
        </>
      )}
    </div>
  );
}
