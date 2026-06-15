import { PageHeader, EmptyState } from "@/components/ui";

export default function ReportesPage() {
  return (
    <div>
      <PageHeader title="Reportes" subtitle="Exporte comparaciones para los comités de contratación." />
      <EmptyState
        title="Sin reportes"
        description="Genere comparaciones para exportarlas a Excel o PDF. (Fase 4)"
      />
    </div>
  );
}
