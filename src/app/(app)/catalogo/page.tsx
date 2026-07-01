import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import type { Prisma, ItemKind } from "@prisma/client";
import { Trash2, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/modal";
import { MutateButton } from "@/components/mutate-button";
import { ActionButton } from "@/components/action-button";
import { Pagination } from "@/components/pagination";
import { TableFilters } from "@/components/table-filters";
import { ITEM_KIND_LABELS, ITEM_KINDS } from "@/lib/constants";
import { ItemForm } from "./item-form";
import { deleteCanonicalItem } from "./actions";
import { verifyCatalogAgainstSispro } from "../actualizaciones-cups/actions";

const PAGE_SIZE = 20;

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tipo?: string; estado?: string }>;
}) {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const tipo = ITEM_KINDS.includes(sp.tipo as ItemKind)
    ? (sp.tipo as ItemKind)
    : undefined;
  const showAll = sp.estado === "todos";

  const where: Prisma.CanonicalItemWhereInput = {
    organizationId: session.organizationId,
    ...(showAll ? {} : { isActive: true }),
    ...(tipo ? { kind: tipo } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { canonicalCode: { contains: q, mode: "insensitive" } },
            { normativeCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.canonicalItem.findMany({
      where,
      orderBy: { canonicalCode: "asc" },
      include: { codes: true, _count: { select: { rateCards: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.canonicalItem.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Catálogo canónico"
        subtitle="Ítems estándar contra los que se homologan los servicios y productos de los proveedores."
        action={
          canManage ? (
            <div className="flex items-center gap-2">
              <form action={verifyCatalogAgainstSispro}>
                <ActionButton variant="secondary">
                  <ShieldCheck className="h-4 w-4" /> Verificar contra SISPRO
                </ActionButton>
              </form>
              <Modal triggerLabel="Nuevo ítem" title="Nuevo ítem canónico">
                <ItemForm />
              </Modal>
            </div>
          ) : undefined
        }
      />
      <div className="mb-4 flex gap-1 text-sm">
        <Link
          href="/catalogo"
          className={
            showAll
              ? "rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
              : "rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900"
          }
        >
          Activos
        </Link>
        <Link
          href="/catalogo?estado=todos"
          className={
            showAll
              ? "rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-900"
              : "rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-100"
          }
        >
          Todos (incluye inactivos)
        </Link>
      </div>

      {total === 0 && !q && !tipo ? (
        <EmptyState
          title="Catálogo vacío"
          description="Defina los ítems canónicos o impórtelos desde el Excel existente con el script de importación."
        />
      ) : (
        <>
          <TableFilters
            searchPlaceholder="Buscar por nombre o código…"
            selects={[
              {
                name: "tipo",
                allLabel: "Todos los tipos",
                options: ITEM_KINDS.map((k) => ({
                  value: k,
                  label: ITEM_KIND_LABELS[k],
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
                  <th className="px-5 py-3 font-medium">CUPS propio</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Códigos</th>
                  <th className="px-5 py-3 font-medium">Tarifas</th>
                  {canManage && (
                    <th className="px-5 py-3 text-right font-medium">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className={it.isActive ? "hover:bg-slate-50" : "bg-slate-50/60 opacity-70 hover:opacity-100"}
                  >
                    <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900">
                      {it.canonicalCode}
                      {!it.isActive && (
                        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {ITEM_KIND_LABELS[it.kind]}
                    </td>
                    <td className="px-5 py-3 text-slate-900">
                      {it.name}
                      {it.description && (
                        <span className="block text-xs text-slate-400">
                          {it.description}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {it.codes.length > 0
                        ? it.codes.map((c) => `${c.system}:${c.code}`).join(", ")
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {it._count.rateCards}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Modal
                            triggerLabel="Editar"
                            title="Editar ítem canónico"
                            triggerClassName="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                          >
                            <ItemForm
                              initial={{
                                id: it.id,
                                kind: it.kind,
                                canonicalCode: it.canonicalCode,
                                normativeCode: it.normativeCode,
                                name: it.name,
                                description: it.description,
                                includesFees: it.includesFees,
                                includesSupplies: it.includesSupplies,
                              }}
                            />
                          </Modal>
                          <MutateButton
                            action={deleteCanonicalItem}
                            fields={{ id: it.id }}
                            variant="danger"
                            confirmText={`¿Borrar el ítem "${it.name}"?`}
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
            basePath="/catalogo"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            params={{
              ...(q ? { q } : {}),
              ...(tipo ? { tipo } : {}),
              ...(showAll ? { estado: "todos" } : {}),
            }}
          />
          </>
          )}
        </>
      )}
    </div>
  );
}
