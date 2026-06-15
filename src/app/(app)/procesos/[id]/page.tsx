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
import { UploadForm } from "./upload-form";
import { MappingForm } from "./mapping-form";
import { requestNormalization } from "../actions";

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
    select: { status: true, providerItem: { select: { uploadId: true } } },
  });
  const counts = new Map<
    string,
    { mapped: number; auto: number; pending: number; noMatch: number }
  >();
  for (const m of mappings) {
    const key = m.providerItem.uploadId;
    const c = counts.get(key) ?? { mapped: 0, auto: 0, pending: 0, noMatch: 0 };
    c.mapped++;
    if (m.status === "AUTO_APPROVED" || m.status === "APPROVED") c.auto++;
    else if (m.status === "PENDING_REVIEW") c.pending++;
    else if (m.status === "NO_MATCH" || m.status === "REJECTED") c.noMatch++;
    counts.set(key, c);
  }

  return (
    <div>
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

      {canManage && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Cargar archivo de proveedor
          </h2>
          <UploadForm processId={process.id} providers={providerOptions} />
        </Card>
      )}

      {process.uploads.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            Aún no hay archivos cargados en este proceso.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {process.uploads.map((upload) => {
            const cm = (upload.columnMapping ?? {}) as {
              mapping?: ColumnMapping;
              headers?: string[];
              method?: string;
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
                  />
                )}

                {upload.status === "NORMALIZING" && (
                  <p className="text-sm text-blue-600">
                    Homologando ítems con IA… recargue en unos momentos.
                  </p>
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
                              <form action={requestNormalization}>
                                <input
                                  type="hidden"
                                  name="uploadId"
                                  value={upload.id}
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                                >
                                  Iniciar homologación
                                </button>
                              </form>
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
                              href="/revision"
                              className="ml-auto text-sm font-medium text-slate-700 hover:text-slate-900"
                            >
                              Ir a revisión →
                            </Link>
                          )}
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
