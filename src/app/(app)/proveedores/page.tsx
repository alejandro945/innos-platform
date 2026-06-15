import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ProviderForm } from "./provider-form";
import { toggleProviderStatus } from "./actions";

export default async function ProveedoresPage() {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROVIDER_MANAGER");

  const providers = await prisma.provider.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { rateCards: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Administre los proveedores y su historial de tarifas."
      />

      {canManage && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nuevo proveedor
          </h2>
          <ProviderForm />
        </Card>
      )}

      {providers.length === 0 ? (
        <EmptyState
          title="Sin proveedores"
          description="Agregue proveedores para asociar sus tarifarios y compararlos."
        />
      ) : (
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
                        <button
                          type="submit"
                          className="text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          {p.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
