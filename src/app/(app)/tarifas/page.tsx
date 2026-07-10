import Link from "next/link";
import type { Prisma, ItemKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { MutateButton } from "@/components/mutate-button";
import { Pagination } from "@/components/pagination";
import { TableFilters } from "@/components/table-filters";
import { concatExtra, formatCurrency, formatDate } from "@/lib/format";
import { ITEM_KIND_LABELS, ITEM_KINDS } from "@/lib/constants";
import { RateForm } from "./rate-form";
import { deleteRate } from "./actions";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const PAGE_SIZE = 25;

export default async function TarifasPage({
  searchParams,
}: {
  searchParams: Promise<{
    vigentes?: string;
    page?: string;
    q?: string;
    tipo?: string;
    proveedor?: string;
  }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const onlyCurrent = sp.vigentes === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const tipo = ITEM_KINDS.includes(sp.tipo as ItemKind)
    ? (sp.tipo as ItemKind)
    : undefined;
  const proveedor = sp.proveedor?.trim() || undefined;
  const canManage = hasAnyRole(
    session.roles,
    "ADMIN",
    "PROCUREMENT_ANALYST",
    "PROVIDER_MANAGER",
  );

  const now = new Date();
  const where: Prisma.RateCardWhereInput = {
    organizationId: session.organizationId,
    ...(onlyCurrent ? { validFrom: { lte: now } } : {}),
    ...(proveedor ? { providerId: proveedor } : {}),
    ...(tipo ? { canonicalItem: { kind: tipo } } : {}),
    AND: [
      ...(onlyCurrent
        ? [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }]
        : []),
      ...(q
        ? [
            {
              OR: [
                {
                  canonicalItem: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" as const } },
                      { normativeCode: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                },
                { providerCode: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [rates, total, items, providers] = await Promise.all([
    prisma.rateCard.findMany({
      where,
      orderBy: [{ canonicalItem: { name: "asc" } }, { value: "asc" }],
      include: {
        canonicalItem: true,
        provider: true,
        sourceProcess: { select: { id: true, name: true } },
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.rateCard.count({ where }),
    prisma.canonicalItem.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.provider.findMany({
      where: { organizationId: session.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);

  const itemOptions = items.map((i) => ({
    id: i.id,
    label: i.normativeCode ? `${i.normativeCode} — ${i.name}` : i.name,
  }));
  const providerOptions = providers.map((p) => ({ id: p.id, label: p.name }));

  return (
    <div>
      <PageHeader
        title="Repositorio de tarifas"
        subtitle="Valores por ítem y proveedor, con exclusiones y vigencia."
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-sm">
              <Link
                href="/tarifas"
                className={
                  onlyCurrent
                    ? "rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
                    : "rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900"
                }
              >
                Todas
              </Link>
              <Link
                href="/tarifas?vigentes=1"
                className={
                  onlyCurrent
                    ? "rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900"
                    : "rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
                }
              >
                Vigentes hoy
              </Link>
            </div>
            {canManage && (
              <Modal triggerLabel="Nueva tarifa" title="Nueva tarifa">
                <RateForm items={itemOptions} providers={providerOptions} />
              </Modal>
            )}
          </div>
        }
      />

      {total === 0 && !q && !tipo && !proveedor ? (
        <EmptyState
          title="Sin tarifas"
          description="Registre tarifas, impórtelas del Excel, o cárguelas desde un proceso de contratación."
        />
      ) : (
        <>
          <TableFilters
            searchPlaceholder="Buscar por ítem o código…"
            selects={[
              {
                name: "tipo",
                allLabel: "Todos los tipos",
                options: ITEM_KINDS.map((k) => ({
                  value: k,
                  label: ITEM_KIND_LABELS[k],
                })),
              },
              {
                name: "proveedor",
                allLabel: "Todos los proveedores",
                options: providerOptions.map((p) => ({
                  value: p.id,
                  label: p.label,
                })),
              },
            ]}
          />
          {total === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">Sin resultados.</p>
            </Card>
          ) : (
          <>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Ítem</th>
                  <th className="px-5 py-3 font-medium">Código proveedor</th>
                  <th className="px-5 py-3 font-medium">Proveedor</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Valor</th>
                  <th className="px-5 py-3 font-medium">Inclusiones</th>
                  <th className="px-5 py-3 font-medium">Exclusiones</th>
                  <th className="px-5 py-3 font-medium">Campos adicionales</th>
                  <th className="px-5 py-3 font-medium">Vigencia</th>
                  {canManage && (
                    <th className="px-5 py-3 text-right font-medium">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      {r.canonicalItem.normativeCode && (
                        <span className="font-mono text-xs text-slate-500">
                          {r.canonicalItem.normativeCode}
                        </span>
                      )}
                      <span className="block text-slate-900">
                        {r.canonicalItem.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {ITEM_KIND_LABELS[r.canonicalItem.kind]}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">
                      {r.providerCode ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      <div className="font-medium text-slate-900">
                        {r.provider.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.sourceProcess ? (
                          <>
                            Proceso:{" "}
                            <Link
                              href={`/procesos/${r.sourceProcess.id}`}
                              className="underline hover:text-slate-600"
                            >
                              {r.sourceProcess.name}
                            </Link>
                          </>
                        ) : (
                          r.tariffSource || "Manual"
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {formatCurrency(r.value.toString())}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {r.inclusions ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {r.exclusions ?? "—"}
                    </td>
                    <td
                      className="max-w-56 px-5 py-3 text-xs text-slate-600"
                      title={concatExtra(r.extra) || undefined}
                    >
                      {concatExtra(r.extra) || "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {formatDate(r.validFrom)} → {formatDate(r.validTo)}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Modal
                            triggerLabel="Editar"
                            title="Editar tarifa"
                            triggerClassName="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                          >
                            <RateForm
                              initial={{
                                id: r.id,
                                itemLabel: r.canonicalItem.normativeCode
                                  ? `${r.canonicalItem.normativeCode} — ${r.canonicalItem.name}`
                                  : r.canonicalItem.name,
                                providerLabel: r.provider.name,
                                tariffSource: r.tariffSource,
                                type: r.type,
                                value: r.value.toString(),
                                inclusions: r.inclusions,
                                exclusions: r.exclusions,
                                validFrom: toDateInput(r.validFrom),
                                validTo: toDateInput(r.validTo),
                              }}
                            />
                          </Modal>
                          <MutateButton
                            action={deleteRate}
                            fields={{ id: r.id }}
                            variant="danger"
                            confirmText="¿Borrar esta tarifa?"
                            title="Borrar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </MutateButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            basePath="/tarifas"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            params={{
              ...(onlyCurrent ? { vigentes: "1" } : {}),
              ...(q ? { q } : {}),
              ...(tipo ? { tipo } : {}),
              ...(proveedor ? { proveedor } : {}),
            }}
          />
          </>
          )}
        </>
      )}
    </div>
  );
}
