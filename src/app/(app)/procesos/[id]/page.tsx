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

                {upload.status === "READY" && (
                  <div>
                    <p className="mb-2 text-sm text-slate-500">
                      {upload._count.providerItems} ítems listos. Vista previa
                      (la homologación con IA es la siguiente fase).
                    </p>
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
