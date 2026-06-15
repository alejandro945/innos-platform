import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import type { Prisma } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { MutateButton } from "@/components/mutate-button";
import { Pagination } from "@/components/pagination";
import { TableFilters } from "@/components/table-filters";
import { formatDate } from "@/lib/format";
import { ProviderForm } from "./provider-form";
import { toggleProviderStatus, deleteProvider } from "./actions";

const PAGE_SIZE = 20;

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireSession();
  const canManage = hasAnyRole(session.roles, "ADMIN", "PROVIDER_MANAGER");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();

  const where: Prisma.ProviderWhereInput = {
    organizationId: session.organizationId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nit: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [providers, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { rateCards: true, uploads: true } } },
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

      {total === 0 && !q ? (
        <EmptyState
          title="Sin proveedores"
          description="Agregue proveedores para asociar sus tarifarios y compararlos."
        />
      ) : (
        <>
          <TableFilters searchPlaceholder="Buscar por nombre, NIT o contacto…" />
          {total === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">
                Sin resultados para “{q}”.
              </p>
            </Card>
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
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <MutateButton
                            action={toggleProviderStatus}
                            fields={{ id: p.id }}
                            variant="link"
                          >
                            {p.status === "ACTIVE" ? "Desactivar" : "Activar"}
                          </MutateButton>
                          <Modal
                            triggerLabel="Editar"
                            title="Editar proveedor"
                            triggerClassName="rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                          >
                            <ProviderForm
                              initial={{
                                id: p.id,
                                name: p.name,
                                nit: p.nit,
                                contactName: p.contactName,
                                contactEmail: p.contactEmail,
                              }}
                            />
                          </Modal>
                          <MutateButton
                            action={deleteProvider}
                            fields={{ id: p.id }}
                            variant="danger"
                            confirmText={`¿Borrar el proveedor "${p.name}"?`}
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
            basePath="/proveedores"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
          </>
          )}
        </>
      )}
    </div>
  );
}
