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
import { detectPriceAnomalies, expiringRates } from "@/lib/analytics";

export default async function DashboardPage() {
  const session = await requireSession();
  const firstName = session.name?.split(" ")[0] ?? "";
  const orgId = session.organizationId;

  const [
    activeProcesses,
    pendingReviews,
    activeProviders,
    rateCount,
    anomalies,
    expiring,
  ] = await Promise.all([
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
    detectPriceAnomalies(orgId),
    expiringRates(orgId, 30),
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
          <h2 className="text-base font-semibold text-slate-900">Alertas</h2>
          <ul className="mt-2 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Anomalías de precio</span>
              <Link
                href="/analisis"
                className={
                  anomalies.length > 0
                    ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                    : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                }
              >
                {anomalies.length}
              </Link>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Tarifas que vencen en 30 días</span>
              <Link
                href="/analisis"
                className={
                  expiring.length > 0
                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                    : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                }
              >
                {expiring.length}
              </Link>
            </li>
          </ul>
          <Link
            href="/analisis"
            className="mt-3 inline-block text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            Ver análisis →
          </Link>
        </Card>
      </div>
    </div>
  );
}
