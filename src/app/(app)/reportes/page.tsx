import Link from "next/link";
import { Download, FileBarChart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";

export default async function ReportesPage() {
  const session = await requireSession();

  const comparisons = await prisma.comparison.findMany({
    where: { process: { organizationId: session.organizationId } },
    orderBy: { generatedAt: "desc" },
    include: {
      process: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Comparaciones generadas, listas para exportar a Excel o PDF."
      />

      {comparisons.length === 0 ? (
        <EmptyState
          title="Sin reportes"
          description="Genere una comparación desde un proceso de contratación para verla aquí."
        />
      ) : (
        <div className="space-y-3">
          {comparisons.map((c) => {
            const summary = (c.summary ?? {}) as { totalSavings?: number };
            return (
              <Card key={c.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileBarChart className="h-5 w-5 text-slate-400" />
                  <div>
                    <Link
                      href={`/procesos/${c.process.id}/comparacion`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {c.process.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {c._count.lines} ítems · ahorro{" "}
                      {formatCurrency(String(summary.totalSavings ?? 0))} ·{" "}
                      {formatDate(c.generatedAt)}
                    </p>
                  </div>
                </div>
                <a
                  href={`/procesos/${c.process.id}/comparacion/export`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" /> Excel
                </a>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
