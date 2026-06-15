import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { hasAnyRole, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  "mapping.approved": "Homologación aprobada",
  "mapping.rejected": "Homologación rechazada",
  "mapping.created_canonical": "Ítem canónico creado",
  "rates.promoted": "Tarifas cargadas al repositorio",
};

const AUDIT_PAGE_SIZE = 25;

export default async function AdministracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const session = await requireSession();
  if (!hasAnyRole(session.roles, "ADMIN")) redirect("/");
  const sp = await searchParams;
  const tab = sp.tab === "auditoria" ? "auditoria" : "usuarios";
  const page = Math.max(1, Number(sp.page) || 1);
  const orgId = session.organizationId;

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    include: { roles: true },
  });
  const userById = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  const tabLink = (t: string) => `/administracion?tab=${t}`;

  return (
    <div>
      <PageHeader
        title="Administración"
        subtitle="Usuarios, roles y registro de auditoría."
      />

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {[
          { key: "usuarios", label: "Usuarios" },
          { key: "auditoria", label: "Auditoría" },
        ].map((t) => (
          <Link
            key={t.key}
            href={tabLink(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "usuarios" ? (
        <Card className="overflow-hidden p-0">
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
      ) : (
        <AuditTab orgId={orgId} page={page} userById={userById} />
      )}
    </div>
  );
}

async function AuditTab({
  orgId,
  page,
  userById,
}: {
  orgId: string;
  page: number;
  userById: Map<string, string>;
}) {
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.count({ where: { organizationId: orgId } }),
  ]);

  if (total === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Sin actividad registrada aún.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Acción</th>
              <th className="px-5 py-3 font-medium">Responsable</th>
              <th className="px-5 py-3 font-medium">Entidad</th>
              <th className="px-5 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-5 py-2.5 text-slate-800">
                  {ACTION_LABELS[l.action] ?? l.action}
                </td>
                <td className="px-5 py-2.5 text-slate-600">
                  {l.actorId ? (userById.get(l.actorId) ?? "—") : "Sistema"}
                </td>
                <td className="px-5 py-2.5 text-xs text-slate-400">
                  {l.entityType}
                </td>
                <td className="px-5 py-2.5 text-xs text-slate-500">
                  {formatDate(l.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination
        basePath="/administracion"
        page={page}
        pageSize={AUDIT_PAGE_SIZE}
        total={total}
        params={{ tab: "auditoria" }}
      />
    </>
  );
}
