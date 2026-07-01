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

  if (verification.status === "RUNNING") {
    const scanned = await prisma.sisproVerificationResult.count({
      where: { verificationId: id },
    });
    return (
      <div>
        <AutoRefresh endpoint={`/api/catalogo/verificacion-sispro/${id}/progress`} />
        <PageHeader
          title="Verificación contra SISPRO"
          subtitle="Comparando los CUPS normativos de tu catálogo contra el consultor público de SISPRO."
          action={
            <Link
              href="/catalogo/verificacion-sispro"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Ver todas las verificaciones
            </Link>
          }
        />
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-700">Verificando…</p>
          <p className="text-sm text-slate-500">
            {scanned} advertencia(s) encontradas hasta ahora. Esto corre
            despacio a propósito para no saturar el servidor de SISPRO.
          </p>
        </Card>
      </div>
    );
  }

  if (verification.status === "FAILED") {
    return (
      <div>
        <PageHeader
          title="Verificación contra SISPRO"
          action={
            <Link
              href="/catalogo/verificacion-sispro"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Ver todas las verificaciones
            </Link>
          }
        />
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

  const [results, total] = await Promise.all([
    prisma.sisproVerificationResult.findMany({
      where: { verificationId: id },
      include: { canonicalItem: { select: { canonicalCode: true, name: true } } },
      orderBy: { status: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.sisproVerificationResult.count({ where: { verificationId: id } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Verificación contra SISPRO"
        subtitle={`Ejecutada el ${formatDate(verification.runAt)}`}
        action={
          <Link
            href="/catalogo/verificacion-sispro"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Ver todas las verificaciones
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Ítems verificados" value={String(verification.scannedCount)} />
        <StatCard
          label="Con advertencia"
          value={String(total)}
          hint="No coinciden, no se encontraron, o falló la consulta"
        />
      </div>

      {total === 0 ? (
        <Card className="bg-emerald-50">
          <p className="text-sm text-emerald-900">
            Todos los CUPS normativos verificados coinciden con SISPRO.
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
