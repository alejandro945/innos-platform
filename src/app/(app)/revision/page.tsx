import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReviewRow, type ReviewItem } from "./review-row";

export default async function RevisionPage({
  searchParams,
}: {
  searchParams: Promise<{ proceso?: string }>;
}) {
  const session = await requireSession();
  const { proceso } = await searchParams;

  const processName = proceso
    ? (
        await prisma.procurementProcess.findFirst({
          where: { id: proceso, organizationId: session.organizationId },
          select: { name: true },
        })
      )?.name
    : null;

  const mappings = await prisma.itemMapping.findMany({
    where: {
      status: { in: ["PENDING_REVIEW", "NO_MATCH"] },
      providerItem: {
        provider: { organizationId: session.organizationId },
        ...(proceso ? { upload: { processId: proceso } } : {}),
      },
    },
    orderBy: [{ status: "asc" }, { confidence: "desc" }],
    include: { providerItem: { include: { provider: true } } },
    take: 100,
  });

  const items: ReviewItem[] = mappings.map((m) => ({
    mappingId: m.id,
    rawName: m.providerItem.rawName,
    rawCode: m.providerItem.rawCode,
    rawPrice: m.providerItem.rawPrice?.toString() ?? null,
    providerName: m.providerItem.provider.name,
    confidence: m.confidence,
    rationale: m.rationale,
    suggestedId: m.canonicalItemId,
  }));

  const catalog = await prisma.canonicalItem.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { canonicalCode: "asc" },
    select: { id: true, canonicalCode: true, name: true },
  });
  const options = catalog.map((c) => ({
    id: c.id,
    label: `${c.canonicalCode} — ${c.name}`,
  }));

  return (
    <div>
      <PageHeader
        title="Revisión de homologaciones"
        subtitle={
          processName
            ? `Proceso: ${processName}. Lo que apruebe se reutiliza automáticamente la próxima vez.`
            : "Valide las coincidencias sugeridas por la IA. Lo que apruebe se reutiliza automáticamente la próxima vez."
        }
        action={
          proceso ? (
            <Link
              href={`/procesos/${proceso}`}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Volver al proceso
            </Link>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Bandeja vacía"
          description="No hay homologaciones pendientes. Las de confianza media o baja aparecerán aquí tras procesar un archivo."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {items.length} ítem(s) por revisar. Si el servicio del proveedor no
            existe en el catálogo, use{" "}
            <strong>“Crear ítem canónico y aprobar”</strong>.
          </p>
          {items.map((item) => (
            <ReviewRow key={item.mappingId} item={item} options={options} />
          ))}
        </div>
      )}
    </div>
  );
}
