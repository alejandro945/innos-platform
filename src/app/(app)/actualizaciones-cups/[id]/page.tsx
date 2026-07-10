import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { MutateButton } from "@/components/mutate-button";
import { Pagination } from "@/components/pagination";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDate } from "@/lib/format";
import {
  REGULATORY_STATUS_LABELS,
  REGULATORY_STATUS_STYLES,
  CUPS_CHANGE_STATUS_LABELS,
  CUPS_CHANGE_STATUS_STYLES,
} from "@/lib/regulatory-status";
import { buildRegulatoryEmailDrafts } from "@/lib/regulatory-email";
import {
  CHUNK_OUTCOME_LABELS,
  type ChunkOutcome,
} from "@/lib/regulatory-extraction";
import type { RegulatoryChunkLog } from "@prisma/client";
import { CopyButton } from "../copy-button";
import {
  setChangeStatus,
  applyRegulatoryUpdate,
  retryRegulatoryExtraction,
  deleteRegulatoryUpdate,
} from "../actions";

const PAGE_SIZE = 30;
// Past this, EXTRACTING likely means the job died silently (killed by a
// serverless timeout without INNGEST_EVENT_KEY configured — see
// triggerRegulatoryExtraction in actions.ts) rather than still working.
const STALE_MINUTES = 10;

export default async function RegulatoryUpdateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN");
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const update = await prisma.regulatoryUpdate.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!update) notFound();

  if (update.status === "EXTRACTING") {
    const found = await prisma.cupsCodeChange.count({
      where: { regulatoryUpdateId: id },
    });
    const elapsedMinutes = Math.floor(
      (new Date().getTime() - update.createdAt.getTime()) / 60_000,
    );
    const { chunksProcessed, chunksTotal } = update;
    const hasProgress = chunksTotal != null;
    const pct =
      hasProgress && chunksTotal! > 0
        ? Math.min(100, Math.round((chunksProcessed / chunksTotal!) * 100))
        : 0;
    // No visible movement yet (not even the chunk count) past the threshold
    // is a much stronger "it died" signal than just being slow once it's
    // actually chewing through chunks — a single chunk shouldn't take this
    // long even in the worst case (LLM calls are timeout-bounded).
    const likelyDead = !hasProgress && elapsedMinutes >= STALE_MINUTES;
    const justSlow = hasProgress && elapsedMinutes >= STALE_MINUTES;

    return (
      <div>
        <AutoRefresh endpoint={`/api/actualizaciones-cups/${id}/progress`} />
        <PageHeader
          title={update.sourceFileName}
          subtitle="Actualización de códigos CUPS"
          action={
            <Link
              href="/actualizaciones-cups"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Ver todas
            </Link>
          }
        />

        {(likelyDead || justSlow) && canManage && (
          <Card className={likelyDead ? "mb-6 bg-amber-50" : "mb-6 bg-slate-50"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${likelyDead ? "text-amber-600" : "text-slate-400"}`}
                />
                <p className={`text-sm ${likelyDead ? "text-amber-900" : "text-slate-600"}`}>
                  {likelyDead ? (
                    <>
                      Lleva {elapsedMinutes} minutos “analizando” sin
                      procesar ni un fragmento — probablemente el proceso se
                      interrumpió (por ejemplo, sin Inngest configurado, el
                      análisis puede exceder el tiempo máximo de una función
                      serverless y morir en silencio). Podés reintentar sin
                      volver a subir el archivo.
                    </>
                  ) : (
                    <>
                      Va avanzando (fragmento {chunksProcessed} de{" "}
                      {chunksTotal}), solo que despacio — normal si la IA
                      corre en un servidor con pocos recursos. Si preferís no
                      esperar, podés reintentar o eliminar.
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <MutateButton
                  action={retryRegulatoryExtraction}
                  fields={{ regulatoryUpdateId: id }}
                  variant="success"
                  successMessage="Reintentando."
                >
                  Reintentar
                </MutateButton>
                <MutateButton
                  action={deleteRegulatoryUpdate}
                  fields={{ regulatoryUpdateId: id }}
                  variant="danger"
                  confirmText="¿Eliminar esta resolución? Tendrás que volver a subirla."
                  successMessage="Eliminada."
                >
                  Eliminar
                </MutateButton>
              </div>
            </div>
          </Card>
        )}

        <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-700">
            Analizando la resolución con IA…
          </p>
          {hasProgress && (
            <div className="w-full max-w-sm">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>
                  fragmento {chunksProcessed} de {chunksTotal}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
          <p className="text-sm text-slate-500">
            {found} cambio(s) de código detectados hasta ahora. Cargada hace{" "}
            {elapsedMinutes} minuto(s). Esto puede tardar varios minutos en
            resoluciones extensas.
          </p>
        </Card>
      </div>
    );
  }

  if (update.status === "FAILED") {
    const chunkLogs = await prisma.regulatoryChunkLog.findMany({
      where: { regulatoryUpdateId: id },
      orderBy: { chunkIndex: "asc" },
    });
    return (
      <div>
        <PageHeader
          title={update.sourceFileName}
          subtitle="Actualización de códigos CUPS"
          action={
            <Link
              href="/actualizaciones-cups"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Ver todas
            </Link>
          }
        />
        <Card className="mb-6 bg-rose-50">
          <p className="mb-3 text-sm text-rose-900">
            No se pudo procesar esta resolución (archivo vacío, ilegible, la
            IA no está configurada, o el análisis se interrumpió).
          </p>
          {canManage && (
            <div className="flex gap-2">
              <MutateButton
                action={retryRegulatoryExtraction}
                fields={{ regulatoryUpdateId: id }}
                variant="success"
                successMessage="Reintentando."
              >
                Reintentar
              </MutateButton>
              <MutateButton
                action={deleteRegulatoryUpdate}
                fields={{ regulatoryUpdateId: id }}
                variant="danger"
                confirmText="¿Eliminar esta resolución? Tendrás que volver a subirla."
                successMessage="Eliminada."
              >
                Eliminar
              </MutateButton>
            </div>
          )}
        </Card>
        <ChunkTraceCard logs={chunkLogs} chunksTotal={update.chunksTotal} />
      </div>
    );
  }

  const [changes, totalChanges, matchedTotal, approvedCount, chunkLogs] = await Promise.all([
    prisma.cupsCodeChange.findMany({
      where: { regulatoryUpdateId: id },
      include: { matchedItem: { select: { normativeCode: true, name: true } } },
      orderBy: { oldCode: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.cupsCodeChange.count({ where: { regulatoryUpdateId: id } }),
    prisma.cupsCodeChange.count({
      where: { regulatoryUpdateId: id, matchedItemId: { not: null } },
    }),
    prisma.cupsCodeChange.count({
      where: { regulatoryUpdateId: id, status: "APPROVED" },
    }),
    prisma.regulatoryChunkLog.findMany({
      where: { regulatoryUpdateId: id },
      orderBy: { chunkIndex: "asc" },
    }),
  ]);

  const emailDrafts =
    update.status === "APPLIED" ? await buildRegulatoryEmailDrafts(id) : [];

  return (
    <div>
      <PageHeader
        title={
          update.resolutionNumber
            ? `Resolución ${update.resolutionNumber}`
            : update.sourceFileName
        }
        subtitle={
          [update.title, update.resolutionDate ? `del ${formatDate(update.resolutionDate)}` : null]
            .filter(Boolean)
            .join(" ") || update.sourceFileName
        }
        action={
          <div className="flex items-center gap-3">
            <Link
              href="/actualizaciones-cups"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Ver todas
            </Link>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${REGULATORY_STATUS_STYLES[update.status]}`}
            >
              {REGULATORY_STATUS_LABELS[update.status]}
            </span>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Cambios de CUPS detectados"
          value={String(totalChanges)}
          hint="Todos los que encontró la IA en la resolución"
        />
        <StatCard
          label="Coinciden con tu catálogo"
          value={String(matchedTotal)}
        />
        <StatCard
          label="Aprobados, listos para aplicar"
          value={String(approvedCount)}
        />
      </div>

      {canManage && approvedCount > 0 && (
        <Card className="mb-6 bg-emerald-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-emerald-900">
              {approvedCount} cambio(s) aprobado(s) listos para aplicar. Se
              crea un ítem nuevo por cada uno (mismo nombre, CUPS normativo
              actualizado) y el ítem viejo queda inactivo.
            </p>
            <MutateButton
              action={applyRegulatoryUpdate}
              fields={{ regulatoryUpdateId: id }}
              variant="success"
              confirmText={`¿Aplicar ${approvedCount} cambio(s) aprobado(s)? Se crea un ítem nuevo por cada reemplazo (mismo nombre, CUPS normativo actualizado) y el ítem viejo queda inactivo. Esta acción no se puede deshacer desde aquí.`}
              successMessage="Cambios aplicados."
            >
              Aplicar cambios aprobados
            </MutateButton>
          </div>
        </Card>
      )}

      <Card className="mb-6 overflow-hidden p-0">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            Cambios de código detectados
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Todo lo que la IA encontró en la resolución, coincida o no con tu
            catálogo — para que siempre quede un registro de lo que se
            analizó.
          </p>
        </div>
        {changes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            La IA no detectó ningún cambio de código CUPS en esta resolución.
            {chunkLogs.length > 0 ? (
              <> Abajo queda la trazabilidad de la lectura: qué fragmentos del
              PDF se leyeron, cuáles se analizaron con IA y por qué no
              arrojaron cambios.</>
            ) : (
              <> Este análisis es anterior a la bitácora de lectura — use
              “Reintentar” para volver a analizar y dejar trazabilidad de lo
              que se lee.</>
            )}
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">CUPS viejo</th>
                  <th className="px-5 py-3 font-medium">CUPS nuevo</th>
                  <th className="px-5 py-3 font-medium">¿Coincide con tu catálogo?</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  {canManage && (
                    <th className="px-5 py-3 text-right font-medium">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {changes.map((c) => (
                  <tr key={c.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-slate-900">
                        {c.oldCode}
                      </span>
                      {c.oldDescription && (
                        <span className="block text-xs text-slate-400">
                          {c.oldDescription}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {c.newCode ? (
                        <>
                          <span className="font-mono text-xs text-slate-900">
                            {c.newCode}
                          </span>
                          {c.newDescription && (
                            <span className="block text-xs text-slate-400">
                              {c.newDescription}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-rose-600">
                          Eliminado sin reemplazo
                        </span>
                      )}
                      {c.note && (
                        <span className="mt-1 block text-xs text-amber-700">{c.note}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {c.matchedItem ? (
                        <>
                          {c.matchedItem.normativeCode && (
                            <span className="font-mono text-xs text-slate-500">
                              {c.matchedItem.normativeCode}
                            </span>
                          )}
                          <span className="block text-slate-900">
                            {c.matchedItem.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">
                          No coincide con tu catálogo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CUPS_CHANGE_STATUS_STYLES[c.status]}`}
                      >
                        {CUPS_CHANGE_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        {c.matchedItem && (
                          <div className="flex justify-end gap-1">
                            {c.status !== "APPROVED" && c.status !== "APPLIED" && (
                              <MutateButton
                                action={setChangeStatus}
                                fields={{ changeId: c.id, status: "APPROVED" }}
                                variant="success"
                                successMessage="Aprobado."
                              >
                                Aprobar
                              </MutateButton>
                            )}
                            {c.status !== "REJECTED" && c.status !== "APPLIED" && (
                              <MutateButton
                                action={setChangeStatus}
                                fields={{ changeId: c.id, status: "REJECTED" }}
                                variant="danger"
                                successMessage="Descartado."
                              >
                                Descartar
                              </MutateButton>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 pb-4">
              <Pagination
                basePath={`/actualizaciones-cups/${id}`}
                page={page}
                pageSize={PAGE_SIZE}
                total={totalChanges}
              />
            </div>
          </>
        )}
      </Card>

      <ChunkTraceCard logs={chunkLogs} chunksTotal={update.chunksTotal} />

      {emailDrafts.length > 0 && (
        <Card className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Avisos para proveedores
            </h2>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Borrador por proveedor afectado — la plataforma no envía correos;
            copie el texto y envíelo desde su propio correo.
          </p>
          <div className="space-y-4">
            {emailDrafts.map((d) => (
              <div
                key={d.providerId}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {d.providerName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {d.contactEmail ?? "Sin correo de contacto registrado"}
                    </p>
                  </div>
                  <CopyButton text={`Asunto: ${d.subject}\n\n${d.body}`} />
                </div>
                <textarea
                  readOnly
                  value={d.body}
                  rows={8}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const OUTCOME_STYLES: Record<ChunkOutcome, string> = {
  CHANGES_FOUND: "bg-emerald-100 text-emerald-700",
  NO_CHANGES: "bg-slate-100 text-slate-600",
  SKIPPED_UNLIKELY: "bg-slate-50 text-slate-400",
  LLM_ERROR: "bg-rose-100 text-rose-700",
  LLM_UNAVAILABLE: "bg-amber-100 text-amber-700",
};

/**
 * Audit trail of the PDF reading: one row per text fragment with what it
 * contained and what the analysis did with it — so "sin resultados" is never
 * the only evidence of a run.
 */
function ChunkTraceCard({
  logs,
  chunksTotal,
}: {
  logs: RegulatoryChunkLog[];
  chunksTotal: number | null;
}) {
  if (logs.length === 0) return null;

  const count = (o: ChunkOutcome) => logs.filter((l) => l.outcome === o).length;
  const analyzed =
    count("CHANGES_FOUND") + count("NO_CHANGES") + count("LLM_ERROR");
  const summary: { label: string; value: number; always?: boolean }[] = [
    { label: "fragmentos leídos", value: logs.length, always: true },
    { label: "analizados con IA", value: analyzed, always: true },
    { label: "omitidos (sin códigos)", value: count("SKIPPED_UNLIKELY"), always: true },
    { label: "con cambios", value: count("CHANGES_FOUND"), always: true },
    { label: "errores de IA", value: count("LLM_ERROR") },
    { label: "sin IA configurada", value: count("LLM_UNAVAILABLE") },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          Trazabilidad de la lectura del PDF
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {chunksTotal
            ? `El texto se dividió en ${chunksTotal} fragmento(s).`
            : null}{" "}
          {summary
            .filter((s) => s.always || s.value > 0)
            .map((s) => `${s.value} ${s.label}`)
            .join(" · ")}
          . Los fragmentos sin códigos de 6 dígitos no se envían a la IA.
        </p>
      </div>
      <details>
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Ver el detalle por fragmento ({logs.length})
        </summary>
        <div className="max-h-96 overflow-y-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">#</th>
                <th className="px-5 py-2 font-medium">Resultado</th>
                <th className="px-5 py-2 font-medium">Códigos vistos</th>
                <th className="px-5 py-2 font-medium">Cambios</th>
                <th className="px-5 py-2 font-medium">Inicio del fragmento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => {
                const outcome = (l.outcome in OUTCOME_STYLES
                  ? l.outcome
                  : "NO_CHANGES") as ChunkOutcome;
                return (
                  <tr key={l.id} className="align-top">
                    <td className="px-5 py-2 text-slate-400">{l.chunkIndex + 1}</td>
                    <td className="px-5 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[outcome]}`}
                      >
                        {CHUNK_OUTCOME_LABELS[outcome]}
                      </span>
                    </td>
                    <td className="px-5 py-2 tabular-nums text-slate-600">
                      {l.codeCandidates}
                    </td>
                    <td className="px-5 py-2 tabular-nums text-slate-600">
                      {l.changesFound}
                    </td>
                    <td className="px-5 py-2 text-xs text-slate-500">
                      {l.excerpt ? `“${l.excerpt}…”` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
