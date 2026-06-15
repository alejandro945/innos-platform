import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { ITEM_KIND_LABELS } from "@/lib/constants";
import { ItemForm } from "./item-form";

export default async function CatalogoPage() {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN");

  const items = await prisma.canonicalItem.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { canonicalCode: "asc" },
    include: {
      codes: true,
      _count: { select: { rateCards: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Catálogo canónico"
        subtitle="Ítems estándar contra los que se homologan los servicios y productos de los proveedores."
      />

      {canManage && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nuevo ítem canónico
          </h2>
          <ItemForm />
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Catálogo vacío"
          description="Defina los ítems canónicos o impórtelos desde el Excel existente con el script de importación."
        />
      ) : (
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
      )}
    </div>
  );
}
