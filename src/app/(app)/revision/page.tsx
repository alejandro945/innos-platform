import { PageHeader, EmptyState } from "@/components/ui";

export default function RevisionPage() {
  return (
    <div>
      <PageHeader title="Revisión de homologaciones" subtitle="Valide las coincidencias sugeridas por la IA." />
      <EmptyState
        title="Bandeja vacía"
        description="Las homologaciones de confianza media o baja aparecerán aquí para su aprobación. (Fase 3)"
      />
    </div>
  );
}
