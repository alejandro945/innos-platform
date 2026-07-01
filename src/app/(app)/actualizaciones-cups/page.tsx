import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import {
  REGULATORY_STATUS_LABELS,
  REGULATORY_STATUS_STYLES,
} from "@/lib/regulatory-status";
import { UploadResolutionForm } from "./upload-form";

const PAGE_SIZE = 20;

export default async function ActualizacionesCupsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN");
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const where = { organizationId: session.organizationId };
  const [updates, total] = await Promise.all([
    prisma.regulatoryUpdate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { changes: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.regulatoryUpdate.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Actualizaciones CUPS"
        subtitle="Suba resoluciones del Ministerio de Salud y actualice el catálogo con los cambios de código."
        action={
          canManage ? (
            <Modal triggerLabel="Cargar resolución" title="Cargar resolución (PDF)">
              <UploadResolutionForm />
            </Modal>
          ) : undefined
        }
      />

      {total === 0 ? (
        <EmptyState
          title="Aún no hay resoluciones cargadas"
          description="Suba el PDF de una resolución del Ministerio de Salud que actualice códigos CUPS. La IA extrae los cambios para que los revise antes de aplicarlos."
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Resolución</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Cambios detectados</th>
                  <th className="px-5 py-3 font-medium">Cargada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {updates.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/actualizaciones-cups/${u.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {u.resolutionNumber
                          ? `Resolución ${u.resolutionNumber}`
                          : u.sourceFileName}
                      </Link>
                      {u.title && (
                        <span className="block text-xs text-slate-400">{u.title}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${REGULATORY_STATUS_STYLES[u.status]}`}
                      >
                        {REGULATORY_STATUS_LABELS[u.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{u._count.changes}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDate(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            basePath="/actualizaciones-cups"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </div>
  );
}
