import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { formatDate } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  "mapping.approved": "Homologación aprobada",
  "mapping.rejected": "Homologación rechazada",
  "mapping.created_canonical": "Ítem canónico creado",
  "rates.promoted": "Tarifas cargadas al repositorio",
};

export default async function AdministracionPage() {
  const session = await requireSession();
  if (!hasAnyRole(session.roles, "ADMIN")) redirect("/");

  const [users, logs] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
      include: { roles: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administración"
        subtitle="Usuarios, roles y registro de auditoría."
      />

      <Card className="p-0">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            Usuarios y roles
          </h2>
          <p className="text-xs text-slate-500">
            Provisión automática vía Microsoft Entra ID. Los roles se asignan por
            grupos de Entra.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Usuario</th>
              <th className="px-5 py-3 font-medium">Correo</th>
              <th className="px-5 py-3 font-medium">Roles</th>
              <th className="px-5 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 text-slate-900">{u.name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-600">{u.email}</td>
                <td className="px-5 py-3 text-slate-600">
                  {u.roles.length > 0
                    ? u.roles.map((r) => ROLE_LABELS[r.role]).join(", ")
                    : "—"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      u.status === "ACTIVE"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                    }
                  >
                    {u.status === "ACTIVE" ? "Activo" : "Inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            Registro de auditoría
          </h2>
          <p className="text-xs text-slate-500">Últimas 100 acciones.</p>
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Sin actividad aún.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
              >
                <span className="text-slate-700">
                  {ACTION_LABELS[l.action] ?? l.action}
                  <span className="ml-2 text-xs text-slate-400">
                    {l.entityType}
                  </span>
                </span>
                <span className="text-xs text-slate-400">
                  {formatDate(l.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
