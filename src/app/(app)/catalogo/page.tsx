import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { ITEM_KIND_LABELS } from "@/lib/constants";
import { ItemForm } from "./item-form";

const PAGE_SIZE = 20;

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN");
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const where = { organizationId: session.organizationId };
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
            <Modal triggerLabel="Nuevo ítem" title="Nuevo ítem canónico">
              <ItemForm />
            </Modal>
          ) : undefined
        }
      />

      {total === 0 ? (
        <EmptyState
          title="Catálogo vacío"
          description="Defina los ítems canónicos o impórtelos desde el Excel existente con el script de importación."
        />
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
                  <th className="px-5 py-3 font-medium">Incluye</th>
                  <th className="px-5 py-3 font-medium">Tarifas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900">
                      {it.canonicalCode}
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
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {[
                        it.includesFees ? "Honorarios" : null,
                        it.includesSupplies ? "Insumos" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {it._count.rateCards}
                    </td>
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
          />
        </>
      )}
    </div>
  );
}
