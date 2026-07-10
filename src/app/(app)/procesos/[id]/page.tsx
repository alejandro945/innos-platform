import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FileText,
  AlertTriangle,
  Loader2,
  Download,
  Printer,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { ComparisonView } from "@/components/comparison-view";
import { Pagination } from "@/components/pagination";
import { getLatestComparison } from "@/lib/comparison";
import { concatExtra, formatCurrency, formatDate } from "@/lib/format";
import {
  PROCESS_STATUS_LABELS,
  PROCESS_STATUS_STYLES,
  UPLOAD_STATUS_LABELS,
} from "@/lib/process-status";
import type { ColumnMapping } from "@/lib/column-mapping";
import { ActionButton } from "@/components/action-button";
import { MutateButton } from "@/components/mutate-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { Modal } from "@/components/modal";
import { Stepper, type Step } from "@/components/stepper";
import { UploadForm } from "./upload-form";
import { MappingForm } from "./mapping-form";
import {
  requestNormalization,
  promoteUploadRates,
  pauseNormalization,
  createComparison,
  deleteUpload,
} from "../actions";

// Each line renders as its own sub-table of provider options, so keep this
// well under the flat-table page sizes used elsewhere (e.g. /tarifas).
const COMPARISON_PAGE_SIZE = 20;

// Module scope: the component shadows `process` with the procurement process.
const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export default async function ProcessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; dedupe?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "comparacion" ? "comparacion" : "archivos";
  const dedupe = sp.dedupe === "1";
  const comparisonPage = Math.max(1, Number(sp.page) || 1);
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROCUREMENT_ANALYST");

  const process = await prisma.procurementProcess.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      uploads: {
        orderBy: { createdAt: "desc" },
        include: {
          provider: true,
          _count: { select: { providerItems: true } },
          providerItems: { take: 8, orderBy: { rowNumber: "asc" } },
        },
      },
    },
  });
  if (!process) notFound();

  const providers = await prisma.provider.findMany({
    where: { organizationId: session.organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  const providerOptions = providers.map((p) => ({ id: p.id, label: p.name }));

  // Mapping status counts per upload (ItemMapping has no uploadId, so reduce in JS).
  const mappings = await prisma.itemMapping.findMany({
    where: { providerItem: { upload: { processId: id } } },
    select: {
      status: true,
      canonicalItemId: true,
      providerItem: { select: { uploadId: true, rawPrice: true } },
    },
  });
  const counts = new Map<
    string,
    {
      mapped: number;
      auto: number;
      pending: number;
      noMatch: number;
      promotable: number;
    }
  >();
  for (const m of mappings) {
    const key = m.providerItem.uploadId;
    const c =
      counts.get(key) ??
      { mapped: 0, auto: 0, pending: 0, noMatch: 0, promotable: 0 };
    c.mapped++;
    const approved = m.status === "AUTO_APPROVED" || m.status === "APPROVED";
    if (approved) c.auto++;
    else if (m.status === "PENDING_REVIEW") c.pending++;
    else if (m.status === "NO_MATCH" || m.status === "REJECTED") c.noMatch++;
    if (approved && m.canonicalItemId && m.providerItem.rawPrice !== null) {
      c.promotable++;
    }
    counts.set(key, c);
  }

  // Rates already promoted to the repository, per upload.
  const promotedGroups = await prisma.rateCard.groupBy({
    by: ["sourceUploadId"],
    where: {
      organizationId: session.organizationId,
      sourceUploadId: { in: process.uploads.map((u) => u.id) },
    },
    _count: true,
  });
  const promoted = new Map<string, number>();
  for (const g of promotedGroups) {
    if (g.sourceUploadId) promoted.set(g.sourceUploadId, g._count);
  }

  const today = new Date().toISOString().slice(0, 10);
  const anyNormalizing = process.uploads.some((u) => u.status === "NORMALIZING");

  const comparisonCount = await prisma.comparison.count({
    where: { processId: id },
  });
  const comparison = await getLatestComparison(id, session.organizationId, {
    page: comparisonPage,
    pageSize: COMPARISON_PAGE_SIZE,
  });

  // Aggregate progress for the stepper.
  const agg = [...counts.values()].reduce(
    (a, c) => ({
      mapped: a.mapped + c.mapped,
      approved: a.approved + c.auto,
      pending: a.pending + c.pending + c.noMatch,
    }),
    { mapped: 0, approved: 0, pending: 0 },
  );
  const totalPromoted = [...promoted.values()].reduce((a, n) => a + n, 0);
  const mappedColumns = process.uploads.some((u) =>
    ["READY", "NORMALIZING", "FAILED"].includes(u.status),
  );

  const stepDefs: { label: string; done: boolean; hint?: string }[] = [
    { label: "Cargar archivo", done: process.uploads.length > 0 },
    { label: "Mapear columnas", done: mappedColumns },
    { label: "Homologar", done: agg.mapped > 0 },
    {
      label: "Revisar",
      done: agg.mapped > 0 && agg.pending === 0,
      hint: agg.pending > 0 ? `${agg.pending} pendientes` : undefined,
    },
    { label: "Comparar", done: comparisonCount > 0 },
    {
      label: "Cargar al repositorio",
      done: totalPromoted > 0,
      hint:
        agg.approved > 0 && totalPromoted === 0
          ? `${agg.approved} listas`
          : undefined,
    },
  ];
  let currentAssigned = false;
  const steps: Step[] = stepDefs.map((s) => {
    if (s.done) return { ...s, state: "done" };
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...s, state: "current" };
    }
    return { ...s, state: "todo" };
  });

  const comparisonReady = !!comparison && comparison.totalItems > 0;
  const comparacionWarn = !comparisonReady || agg.pending > 0;
  const archivosWarn = process.uploads.some((u) => u.status === "FAILED");
  const tabLink = (t: string) => `/procesos/${process.id}?tab=${t}`;

  return (
    <div>
      {anyNormalizing && <AutoRefresh processId={process.id} />}
      <PageHeader
        title={process.name}
        subtitle={process.description ?? undefined}
        action={
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${PROCESS_STATUS_STYLES[process.status]}`}
          >
            {PROCESS_STATUS_LABELS[process.status]}
          </span>
        }
      />

      {/* Guided flow */}
      <Card className="mb-6">
        <Stepper steps={steps} />
        {agg.pending > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-amber-50 p-3">
            <p className="text-sm text-amber-900">
              {agg.pending} homologación(es) requieren tu revisión para poder
              comparar y cargar tarifas.
            </p>
            <Link
              href={`/revision?proceso=${process.id}`}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Revisar →
            </Link>
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        <Link
          href={tabLink("archivos")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "archivos"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Archivos
          {anyNormalizing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          ) : archivosWarn ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
          ) : null}
        </Link>
        <Link
          href={tabLink("comparacion")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "comparacion"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Comparación
          {comparacionWarn && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          )}
        </Link>
      </div>

      {tab === "comparacion" ? (
        <ComparisonTab
          processId={process.id}
          comparison={comparison}
          dedupe={dedupe}
          page={comparisonPage}
          pageSize={COMPARISON_PAGE_SIZE}
          pending={agg.pending}
          canManage={canManage}
        />
      ) : (
        <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Archivos del proceso
        </h2>
        {canManage && (
          <Modal
            triggerLabel="+ Cargar archivo"
            title="Cargar archivo de proveedor"
          >
            <UploadForm
              processId={process.id}
              providers={providerOptions}
              blobEnabled={blobEnabled}
            />
          </Modal>
        )}
      </div>

      {process.uploads.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            Aún no hay archivos cargados. Use{" "}
            <strong>“+ Cargar archivo”</strong> para subir el tarifario de un
            proveedor.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {process.uploads.map((upload) => {
            const cm = (upload.columnMapping ?? {}) as {
              mapping?: ColumnMapping;
              headers?: string[];
              method?: string;
              rows?: Record<string, unknown>[];
            };
            return (
              <Card key={upload.id}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-900">
                      {upload.fileName}
                    </span>
                    <span className="text-xs text-slate-400">
                      · {upload.provider.name} · {upload.rowCount} filas
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {UPLOAD_STATUS_LABELS[upload.status]}
                    </span>
                    {canManage && upload.status !== "NORMALIZING" && (
                      <MutateButton
                        action={deleteUpload}
                        fields={{ uploadId: upload.id }}
                        variant="danger"
                        confirmText={`¿Eliminar el archivo "${upload.fileName}"? Se borran sus ítems y homologaciones (las tarifas ya cargadas al repositorio se conservan).`}
                        title="Eliminar archivo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </MutateButton>
                    )}
                  </div>
                </div>

                {upload.status === "MAPPING" && cm.headers && cm.mapping && (
                  <MappingForm
                    uploadId={upload.id}
                    headers={cm.headers}
                    mapping={cm.mapping}
                    method={cm.method}
                    sample={cm.rows?.slice(0, 3) ?? []}
                  />
                )}

                {upload.status === "NORMALIZING" &&
                  (() => {
                    const done = counts.get(upload.id)?.mapped ?? 0;
                    const total = upload._count.providerItems || 1;
                    const pct = Math.min(100, Math.round((done / total) * 100));
                    return (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm text-blue-700">
                          <span className="flex items-center gap-2">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                            Homologando ítems con IA…
                          </span>
                          <span className="font-medium tabular-nums">
                            {done}/{total} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-slate-400">
                            Se actualiza automáticamente.
                          </p>
                          {canManage && (
                            <div className="flex gap-2">
                              <MutateButton
                                action={pauseNormalization}
                                fields={{ uploadId: upload.id }}
                                variant="secondary"
                                successMessage="Homologación pausada."
                              >
                                Pausar
                              </MutateButton>
                              <MutateButton
                                action={requestNormalization}
                                fields={{ uploadId: upload.id }}
                                variant="secondary"
                                successMessage="Reanudando…"
                                title="Reanudar si parece detenido"
                              >
                                Reanudar
                              </MutateButton>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {upload.status === "PAUSED" &&
                  (() => {
                    const done = counts.get(upload.id)?.mapped ?? 0;
                    const total = upload._count.providerItems || 1;
                    const pct = Math.min(100, Math.round((done / total) * 100));
                    return (
                      <div className="rounded-lg bg-amber-50 p-3">
                        <div className="mb-2 flex items-center justify-between text-sm text-amber-900">
                          <span>Homologación pausada</span>
                          <span className="font-medium tabular-nums">
                            {done}/{total} · {pct}%
                          </span>
                        </div>
                        {canManage && (
                          <MutateButton
                            action={requestNormalization}
                            fields={{ uploadId: upload.id }}
                            variant="primary"
                            successMessage="Reanudando…"
                          >
                            Reanudar
                          </MutateButton>
                        )}
                      </div>
                    );
                  })()}

                {upload.status === "FAILED" && (
                  <div className="flex items-center justify-between rounded-lg bg-rose-50 p-3">
                    <p className="text-sm text-rose-700">
                      La homologación falló. Puede reanudar desde donde quedó.
                    </p>
                    {canManage && (
                      <MutateButton
                        action={requestNormalization}
                        fields={{ uploadId: upload.id }}
                        variant="primary"
                        successMessage="Reanudando…"
                      >
                        Reintentar
                      </MutateButton>
                    )}
                  </div>
                )}

                {upload.status === "READY" && (
                  <div>
                    {(() => {
                      const c = counts.get(upload.id);
                      if (!c || c.mapped === 0) {
                        return (
                          <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 p-3">
                            <p className="text-sm text-slate-600">
                              {upload._count.providerItems} ítems listos para
                              homologar.
                            </p>
                            {canManage && (
                              <MutateButton
                                action={requestNormalization}
                                fields={{ uploadId: upload.id }}
                                variant="primary"
                                successMessage="Homologación iniciada."
                              >
                                Iniciar homologación
                              </MutateButton>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {c.auto} auto-aprobadas
                          </span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            {c.pending} por revisar
                          </span>
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                            {c.noMatch} sin match
                          </span>
                          {c.pending + c.noMatch > 0 && (
                            <Link
                              href={`/revision?proceso=${process.id}`}
                              className="ml-auto text-sm font-medium text-slate-700 hover:text-slate-900"
                            >
                              Ir a revisión →
                            </Link>
                          )}
                        </div>
                      );
                    })()}

                    {/* Promote approved + priced tariffs to the repository. */}
                    {canManage &&
                      (() => {
                        const c = counts.get(upload.id);
                        const promotedCount = promoted.get(upload.id) ?? 0;
                        if (!c || c.promotable === 0) return null;
                        return (
                          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <div className="text-sm text-emerald-900">
                              <strong>{c.promotable}</strong> tarifas homologadas
                              y aprobadas
                              {promotedCount > 0 && (
                                <span className="ml-1 text-emerald-700">
                                  · {promotedCount} ya en el repositorio
                                </span>
                              )}
                            </div>
                            <form
                              action={promoteUploadRates}
                              className="ml-auto flex items-center gap-2"
                            >
                              <input
                                type="hidden"
                                name="uploadId"
                                value={upload.id}
                              />
                              <label className="text-xs text-emerald-900">
                                Vigencia desde
                                <input
                                  type="date"
                                  name="validFrom"
                                  defaultValue={today}
                                  className="ml-2 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs"
                                />
                              </label>
                              <label className="text-xs text-emerald-900">
                                hasta
                                <input
                                  type="date"
                                  name="validTo"
                                  className="ml-2 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs"
                                />
                              </label>
                              <ActionButton variant="success">
                                {promotedCount > 0
                                  ? "Recargar al repositorio"
                                  : "Cargar tarifas al repositorio"}
                              </ActionButton>
                            </form>
                          </div>
                        );
                      })()}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="py-2 pr-4 font-medium">#</th>
                            <th className="py-2 pr-4 font-medium">Nombre crudo</th>
                            <th className="py-2 pr-4 font-medium">Código</th>
                            <th className="py-2 pr-4 font-medium">Valor</th>
                            <th className="py-2 pr-4 font-medium">Tipo</th>
                            <th className="py-2 pr-4 font-medium">
                              Columnas no mapeadas
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {upload.providerItems.map((it) => (
                            <tr key={it.id}>
                              <td className="py-2 pr-4 text-slate-400">
                                {it.rowNumber}
                              </td>
                              <td className="py-2 pr-4 text-slate-900">
                                {it.rawName}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {it.rawCode ?? "—"}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {it.rawPrice
                                  ? formatCurrency(it.rawPrice.toString())
                                  : "—"}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {it.rawType?.toUpperCase() || "PROPIA"}
                              </td>
                              <td
                                className="max-w-72 truncate py-2 pr-4 text-xs text-slate-500"
                                title={concatExtra(it.extra) || undefined}
                              >
                                {concatExtra(it.extra) || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-400">
                  Cargado {formatDate(upload.createdAt)}
                </p>
              </Card>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}

/** Comparison tab: KPIs + actions + table, or generate prompt. */
function ComparisonTab({
  processId,
  comparison,
  dedupe,
  page,
  pageSize,
  pending,
  canManage,
}: {
  processId: string;
  comparison: Awaited<ReturnType<typeof getLatestComparison>>;
  dedupe: boolean;
  page: number;
  pageSize: number;
  pending: number;
  canManage: boolean;
}) {
  if (!comparison) {
    return (
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
            <input type="hidden" name="processId" value={processId} />
            <ActionButton variant="primary">Generar comparación</ActionButton>
          </form>
        )}
      </Card>
    );
  }

  return (
    <div>
      {pending > 0 && (
        <Card className="mb-4 bg-amber-50">
          <p className="text-sm text-amber-900">
            Hay {pending} homologación(es) sin aprobar. Apruébalas en{" "}
            <Link
              href={`/revision?proceso=${processId}`}
              className="font-medium underline"
            >
              Revisión
            </Link>{" "}
            y vuelve a <strong>Regenerar</strong> para incluirlas.
          </p>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ítems comparados" value={String(comparison.totalItems)} />
        <StatCard
          label="Ahorro potencial"
          value={formatCurrency(String(comparison.totalSavings))}
          hint="Suma de (máx − mín) por ítem"
        />
        <StatCard label="Generada" value={formatDate(comparison.generatedAt)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={`/procesos/${processId}/comparacion/export`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Exportar Excel
        </a>
        <Link
          href={`/procesos/${processId}/comparacion/reporte`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" /> Reporte / PDF
        </Link>
        <Link
          href={`/procesos/${processId}?tab=comparacion${dedupe ? "" : "&dedupe=1"}`}
          className={
            dedupe
              ? "inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
              : "inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          }
        >
          {dedupe ? "Mostrando 1 por proveedor" : "1 fila por proveedor"}
        </Link>
        {canManage && (
          <form action={createComparison}>
            <input type="hidden" name="processId" value={processId} />
            <ActionButton variant="secondary">
              <RefreshCw className="h-4 w-4" /> Regenerar
            </ActionButton>
          </form>
        )}
      </div>

      {comparison.totalItems === 0 ? (
        <Card className="bg-amber-50">
          <p className="text-sm text-amber-900">
            No hay ítems homologados y <strong>aprobados</strong>. Aprueba en
            Revisión y regenera.
          </p>
        </Card>
      ) : (
        <>
          <ComparisonView lines={comparison.lines} dedupe={dedupe} />
          <Pagination
            basePath={`/procesos/${processId}`}
            page={page}
            pageSize={pageSize}
            total={comparison.totalItems}
            params={{ tab: "comparacion", ...(dedupe ? { dedupe: "1" } : {}) }}
          />
        </>
      )}
    </div>
  );
}
