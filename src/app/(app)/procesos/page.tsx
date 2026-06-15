import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  PROCESS_STATUS_LABELS,
  PROCESS_STATUS_STYLES,
} from "@/lib/process-status";
import { ProcessForm } from "./process-form";

export default async function ProcesosPage() {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROCUREMENT_ANALYST");

  const processes = await prisma.procurementProcess.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { uploads: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Procesos de contratación"
        subtitle="Cargue archivos de proveedores y genere comparaciones."
      />

      {canManage && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nuevo proceso
          </h2>
          <ProcessForm />
        </Card>
      )}

      {processes.length === 0 ? (
        <EmptyState
          title="Aún no hay procesos"
          description="Cree un proceso de contratación para empezar a cargar tarifas y compararlas."
        />
      ) : (
        <div className="space-y-3">
          {processes.map((p) => (
            <Link key={p.id} href={`/procesos/${p.id}`}>
              <Card className="flex items-center justify-between transition hover:border-slate-300">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-900">{p.name}</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PROCESS_STATUS_STYLES[p.status]}`}
                    >
                      {PROCESS_STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {p._count.uploads} archivo(s) · creado {formatDate(p.createdAt)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
