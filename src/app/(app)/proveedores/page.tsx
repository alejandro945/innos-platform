import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ActionButton } from "@/components/action-button";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { ProviderForm } from "./provider-form";
import { toggleProviderStatus } from "./actions";

const PAGE_SIZE = 20;

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROVIDER_MANAGER");
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const where = { organizationId: session.organizationId };
  const [providers, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { rateCards: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.provider.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Administre los proveedores y su historial de tarifas."
        action={
          canManage ? (
            <Modal triggerLabel="Nuevo proveedor" title="Nuevo proveedor">
              <ProviderForm />
            </Modal>
          ) : undefined
        }
      />

      {total === 0 ? (
        <EmptyState
          title="Sin proveedores"
          description="Agregue proveedores para asociar sus tarifarios y compararlos."
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Proveedor</th>
                  <th className="px-5 py-3 font-medium">NIT</th>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 font-medium">Tarifas</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Registrado</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {p.name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.nit ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.contactName ?? "—"}
                      {p.contactEmail && (
                        <span className="block text-xs text-slate-400">
                          {p.contactEmail}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {p._count.rateCards}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          p.status === "ACTIVE"
                            ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                        }
                      >
                        {p.status === "ACTIVE" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDate(p.createdAt)}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        <form action={toggleProviderStatus}>
                          <input type="hidden" name="id" value={p.id} />
                          <ActionButton variant="link">
                            {p.status === "ACTIVE" ? "Desactivar" : "Activar"}
                          </ActionButton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            basePath="/proveedores"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </div>
  );
}
