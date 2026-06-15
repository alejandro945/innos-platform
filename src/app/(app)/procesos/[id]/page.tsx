import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
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
} from "../actions";

export default async function ProcessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  return (
    <div>
      {anyNormalizing && <AutoRefresh />}
      <PageHeader
        title={process.name}
        subtitle={process.description ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${PROCESS_STATUS_STYLES[process.status]}`}
            >
              {PROCESS_STATUS_LABELS[process.status]}
            </span>
            <Link
              href={`/procesos/${process.id}/comparacion`}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Ver comparación
            </Link>
          </div>
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Archivos del proceso
        </h2>
        {canManage && (
          <Modal
            triggerLabel="+ Cargar archivo"
            title="Cargar archivo de proveedor"
          >
            <UploadForm processId={process.id} providers={providerOptions} />
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
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {UPLOAD_STATUS_LABELS[upload.status]}
                  </span>
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
    </div>
  );
}
