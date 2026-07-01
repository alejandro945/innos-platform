import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 30;

const STATUS_LABELS = {
  MISMATCH: "Nombre distinto en SISPRO",
  NOT_FOUND: "No encontrado en SISPRO",
  ERROR: "Error al consultar",
} as const;

const STATUS_STYLES = {
  MISMATCH: "bg-amber-100 text-amber-700",
  NOT_FOUND: "bg-rose-100 text-rose-700",
  ERROR: "bg-slate-200 text-slate-600",
} as const;

const backLink = (
  <Link
    href="/catalogo/verificacion-sispro"
    className="text-sm text-slate-600 hover:text-slate-900"
  >
    ← Ver todas las verificaciones
  </Link>
);

export default async function SisproVerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const verification = await prisma.sisproVerification.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!verification) notFound();

  if (verification.status === "FAILED") {
    return (
      <div>
        <PageHeader title="Verificación contra SISPRO" action={backLink} />
        <Card className="bg-rose-50">
          <p className="text-sm text-rose-900">
            La verificación falló. La página pública de SISPRO pudo haber
            cambiado — intente de nuevo desde{" "}
            <Link href="/catalogo" className="font-medium underline">
              Catálogo
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  const isRunning = verification.status === "RUNNING";

  const [results, total, totalItems] = await Promise.all([
    prisma.sisproVerificationResult.findMany({
      where: { verificationId: id },
      include: { canonicalItem: { select: { canonicalCode: true, name: true } } },
      orderBy: { status: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.sisproVerificationResult.count({ where: { verificationId: id } }),
    isRunning
      ? prisma.canonicalItem.count({
          where: {
            organizationId: session.organizationId,
            isActive: true,
            normativeCode: { not: null },
          },
        })
      : Promise.resolve(0),
  ]);

  const scanned = verification.scannedCount;
  const pct =
    isRunning && totalItems > 0 ? Math.min(100, Math.round((scanned / totalItems) * 100)) : 0;

  return (
    <div>
      {isRunning && (
        <AutoRefresh endpoint={`/api/catalogo/verificacion-sispro/${id}/progress`} />
      )}
      <PageHeader
        title="Verificación contra SISPRO"
        subtitle={
          isRunning
            ? "Comparando los CUPS normativos de tu catálogo contra el consultor público de SISPRO."
            : `Ejecutada el ${formatDate(verification.runAt)}`
        }
        action={backLink}
      />

      {isRunning && (
        <Card className="mb-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
            <div className="w-full">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>
                  {scanned} de {totalItems} ítems verificados
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
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Corre despacio a propósito para no saturar el servidor de SISPRO —
            esta página se actualiza sola cada varios segundos. Las
            advertencias ya encontradas se listan abajo a medida que aparecen.
          </p>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Ítems verificados" value={String(scanned)} />
        <StatCard
          label="Con advertencia"
          value={String(total)}
          hint="No coinciden, no se encontraron, o falló la consulta"
        />
      </div>

      {total === 0 ? (
        <Card className={isRunning ? undefined : "bg-emerald-50"}>
          <p className={isRunning ? "text-sm text-slate-500" : "text-sm text-emerald-900"}>
            {isRunning
              ? "Sin advertencias por ahora."
              : "Todos los CUPS normativos verificados coinciden con SISPRO."}
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Ítem en tu catálogo</th>
                  <th className="px-5 py-3 font-medium">CUPS normativo</th>
                  <th className="px-5 py-3 font-medium">SISPRO reporta</th>
                  <th className="px-5 py-3 font-medium">Advertencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-slate-500">
                        {r.canonicalItem.canonicalCode}
                      </span>
                      <span className="block text-slate-900">{r.canonicalItem.name}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">
                      {r.normativeCode}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {r.sisproName ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                      {r.note && (
                        <span className="mt-1 block text-xs text-slate-400">{r.note}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            basePath={`/catalogo/verificacion-sispro/${id}`}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </div>
  );
}
