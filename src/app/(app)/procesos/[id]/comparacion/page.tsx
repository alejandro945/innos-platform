import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer, RefreshCw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { ComparisonView } from "@/components/comparison-view";
import { Pagination } from "@/components/pagination";
import { formatCurrency, formatDate } from "@/lib/format";
import { getLatestComparison } from "@/lib/comparison";
import { createComparison } from "../../actions";

// Each line renders as its own sub-table of provider options, so keep this
// well under the flat-table page sizes used elsewhere (e.g. /tarifas).
const PAGE_SIZE = 20;

export default async function ComparacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dedupe?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const dedupe = sp.dedupe === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROCUREMENT_ANALYST");

  const process = await prisma.procurementProcess.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true, name: true },
  });
  if (!process) notFound();

  const comparison = await getLatestComparison(id, session.organizationId, {
    page,
    pageSize: PAGE_SIZE,
  });

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
              <ActionButton variant="primary">Generar comparación</ActionButton>
            </form>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Ítems comparados"
              value={String(comparison.totalItems)}
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
            <Link
              href={`/procesos/${id}/comparacion${dedupe ? "" : "?dedupe=1"}`}
              className={
                dedupe
                  ? "inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
                  : "inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              }
            >
              {dedupe ? "Mostrando 1 por proveedor" : "1 fila por proveedor"}
            </Link>
            {canManage && (
              <form action={createComparison}>
                <input type="hidden" name="processId" value={id} />
                <ActionButton variant="secondary">
                  <RefreshCw className="h-4 w-4" /> Regenerar
                </ActionButton>
              </form>
            )}
          </div>

          {comparison.totalItems === 0 ? (
            <Card className="bg-amber-50">
              <p className="text-sm text-amber-900">
                Aún no hay ítems homologados y <strong>aprobados</strong> en este
                proceso. Vaya a{" "}
                <Link
                  href={`/revision?proceso=${id}`}
                  className="font-medium underline"
                >
                  Revisión
                </Link>{" "}
                para aprobar las coincidencias (o crear ítems canónicos nuevos) y
                luego <strong>Regenere</strong> la comparación.
              </p>
            </Card>
          ) : (
            <>
              <ComparisonView lines={comparison.lines} dedupe={dedupe} />
              <Pagination
                basePath={`/procesos/${id}/comparacion`}
                page={page}
                pageSize={PAGE_SIZE}
                total={comparison.totalItems}
                params={dedupe ? { dedupe: "1" } : {}}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
