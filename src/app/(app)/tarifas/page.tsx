import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { ITEM_KIND_LABELS } from "@/lib/constants";
import { RateForm } from "./rate-form";

export default async function TarifasPage({
  searchParams,
}: {
  searchParams: Promise<{ vigentes?: string }>;
}) {
  const session = await requireSession();
  const { vigentes } = await searchParams;
  const onlyCurrent = vigentes === "1";
  const canManage = hasAnyRole(
    session.roles,
    "ADMIN",
    "PROCUREMENT_ANALYST",
    "PROVIDER_MANAGER",
  );

  const now = new Date();
  const where: Prisma.RateCardWhereInput = {
    organizationId: session.organizationId,
    ...(onlyCurrent
      ? {
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        }
      : {}),
  };

  const [rates, items, providers] = await Promise.all([
    prisma.rateCard.findMany({
      where,
      orderBy: [{ canonicalItem: { canonicalCode: "asc" } }, { value: "asc" }],
      include: { canonicalItem: true, provider: true },
    }),
    prisma.canonicalItem.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { canonicalCode: "asc" },
    }),
    prisma.provider.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);

  const itemOptions = items.map((i) => ({
    id: i.id,
    label: `${i.canonicalCode} — ${i.name}`,
  }));
  const providerOptions = providers.map((p) => ({ id: p.id, label: p.name }));

  return (
    <div>
      <PageHeader
        title="Repositorio de tarifas"
        subtitle="Valores por ítem y proveedor, con exclusiones y vigencia."
        action={
          <div className="flex gap-2 text-sm">
            <Link
              href="/tarifas"
              className={
                onlyCurrent
                  ? "rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
                  : "rounded-lg bg-slate-900 px-3 py-2 font-medium text-white"
              }
            >
              Todas
            </Link>
            <Link
              href="/tarifas?vigentes=1"
              className={
                onlyCurrent
                  ? "rounded-lg bg-slate-900 px-3 py-2 font-medium text-white"
                  : "rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
              }
            >
              Vigentes hoy
            </Link>
          </div>
        }
      />

      {canManage && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nueva tarifa
          </h2>
          <RateForm items={itemOptions} providers={providerOptions} />
        </Card>
      )}

      {rates.length === 0 ? (
        <EmptyState
          title="Sin tarifas"
          description="Registre tarifas o impórtelas desde el Excel existente con el script de importación."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Ítem</th>
                <th className="px-5 py-3 font-medium">Proveedor</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Exclusiones</th>
                <th className="px-5 py-3 font-medium">Vigencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rates.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs text-slate-500">
                      {r.canonicalItem.canonicalCode}
                    </span>
                    <span className="block text-slate-900">
                      {r.canonicalItem.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {ITEM_KIND_LABELS[r.canonicalItem.kind]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {r.provider.name}
                    {r.tariffSource && (
                      <span className="block text-xs text-slate-400">
                        {r.tariffSource}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {formatCurrency(r.value.toString())}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">
                    {r.exclusions ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {formatDate(r.validFrom)} → {formatDate(r.validTo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
