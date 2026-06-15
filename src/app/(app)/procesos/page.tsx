import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { DeleteButton } from "@/components/delete-button";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import {
  PROCESS_STATUS_LABELS,
  PROCESS_STATUS_STYLES,
} from "@/lib/process-status";
import { ProcessForm } from "./process-form";
import { deleteProcess } from "./actions";

const PAGE_SIZE = 20;

export default async function ProcesosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROCUREMENT_ANALYST");
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const where = { organizationId: session.organizationId };
  const [processes, total] = await Promise.all([
    prisma.procurementProcess.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { uploads: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.procurementProcess.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Procesos de contratación"
        subtitle="Cargue archivos de proveedores y genere comparaciones."
        action={
          canManage ? (
            <Modal triggerLabel="Nuevo proceso" title="Nuevo proceso">
              <ProcessForm />
            </Modal>
          ) : undefined
        }
      />

      {total === 0 ? (
        <EmptyState
          title="Aún no hay procesos"
          description="Cree un proceso de contratación para empezar a cargar tarifas y compararlas."
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Proceso</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Archivos</th>
                  <th className="px-5 py-3 font-medium">Creado</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processes.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/procesos/${p.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.description && (
                        <span className="block text-xs text-slate-400">
                          {p.description}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PROCESS_STATUS_STYLES[p.status]}`}
                      >
                        {PROCESS_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {p._count.uploads}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/procesos/${p.id}`}
                          className="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                        >
                          Abrir
                        </Link>
                        {canManage && (
                          <>
                            <Modal
                              triggerLabel="Editar"
                              title="Editar proceso"
                              triggerClassName="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                            >
                              <ProcessForm
                                initial={{
                                  id: p.id,
                                  name: p.name,
                                  description: p.description,
                                }}
                              />
                            </Modal>
                            <DeleteButton
                              action={deleteProcess}
                              id={p.id}
                              confirmText={`¿Borrar el proceso "${p.name}"? Se eliminan sus cargas y comparaciones (las tarifas ya cargadas al repositorio se conservan).`}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            basePath="/procesos"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </div>
  );
}
