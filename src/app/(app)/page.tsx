import Link from "next/link";
import {
  FileStack,
  ClipboardCheck,
  TrendingDown,
  Building2,
  ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, StatCard, Card } from "@/components/ui";

export default async function DashboardPage() {
  const session = await requireSession();
  const firstName = session.name?.split(" ")[0] ?? "";
  const orgId = session.organizationId;

  const [activeProcesses, pendingReviews, activeProviders, rateCount] =
    await Promise.all([
      prisma.procurementProcess.count({
        where: {
          organizationId: orgId,
          status: { in: ["PROCESSING", "IN_REVIEW"] },
        },
      }),
      prisma.itemMapping.count({
        where: {
          status: "PENDING_REVIEW",
          providerItem: { provider: { organizationId: orgId } },
        },
      }),
      prisma.provider.count({
        where: { organizationId: orgId, status: "ACTIVE" },
      }),
      prisma.rateCard.count({ where: { organizationId: orgId } }),
    ]);

  const stats = [
    {
      label: "Procesos activos",
      value: String(activeProcesses),
      hint: "En curso o en revisión",
      icon: FileStack,
    },
    {
      label: "Pendientes de revisión",
      value: String(pendingReviews),
      hint: "Homologaciones por validar",
      icon: ClipboardCheck,
    },
    {
      label: "Tarifas registradas",
      value: String(rateCount),
      hint: "En el repositorio",
      icon: TrendingDown,
    },
    {
      label: "Proveedores activos",
      value: String(activeProviders),
      hint: "Con tarifas vigentes",
      icon: Building2,
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Hola${firstName ? `, ${firstName}` : ""}`}
        subtitle="Resumen de la actividad de contratación y comparación de tarifas."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            Iniciar un proceso de contratación
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Cargue el archivo de tarifas de un proveedor y compárelo
            automáticamente contra el repositorio.
          </p>
          <Link
            href="/procesos"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Nuevo proceso
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">
            Actividad reciente
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Aún no hay actividad. Las cargas y comparaciones aparecerán aquí.
          </p>
        </Card>
      </div>
    </div>
  );
}
