import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReviewRow, type ReviewItem } from "./review-row";

export default async function RevisionPage() {
  const session = await requireSession();

  const mappings = await prisma.itemMapping.findMany({
    where: {
      status: { in: ["PENDING_REVIEW", "NO_MATCH"] },
      providerItem: { provider: { organizationId: session.organizationId } },
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
        subtitle="Valide las coincidencias sugeridas por la IA. Lo que apruebe se reutiliza automáticamente la próxima vez."
      />

      {items.length === 0 ? (
        <EmptyState
          title="Bandeja vacía"
          description="No hay homologaciones pendientes. Las de confianza media o baja aparecerán aquí tras procesar un archivo."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {items.length} ítem(s) por revisar.
          </p>
          {items.map((item) => (
            <ReviewRow key={item.mappingId} item={item} options={options} />
          ))}
        </div>
      )}
    </div>
  );
}
