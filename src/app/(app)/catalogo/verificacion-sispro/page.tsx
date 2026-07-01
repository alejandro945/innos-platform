import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 20;

const STATUS_LABELS = {
  RUNNING: "En curso",
  DONE: "Completada",
  FAILED: "Error",
} as const;

const STATUS_STYLES = {
  RUNNING: "bg-blue-100 text-blue-700",
  DONE: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
} as const;

export default async function SisproVerificationListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const where = { organizationId: session.organizationId };
  const [runs, total] = await Promise.all([
    prisma.sisproVerification.findMany({
      where,
      orderBy: { runAt: "desc" },
      include: { _count: { select: { results: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.sisproVerification.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Verificaciones contra SISPRO"
        subtitle="Historial de comprobaciones del catálogo contra el consultor público de SISPRO."
        action={
          <Link
            href="/catalogo"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Volver al catálogo
          </Link>
        }
      />

      {total === 0 ? (
        <EmptyState
          title="Sin verificaciones todavía"
          description={'Use "Verificar contra SISPRO" desde el catálogo para iniciar una.'}
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Ítems verificados</th>
                  <th className="px-5 py-3 font-medium">Con advertencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/catalogo/verificacion-sispro/${r.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {formatDate(r.runAt)}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.scannedCount}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {r._count.results}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            basePath="/catalogo/verificacion-sispro"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </div>
  );
}
