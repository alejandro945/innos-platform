import { PageHeader, EmptyState } from "@/components/ui";

export default function ProcesosPage() {
  return (
    <div>
      <PageHeader title="Procesos de contratación" subtitle="Cargue archivos de proveedores y genere comparaciones." />
      <EmptyState
        title="Aún no hay procesos"
        description="Cree un proceso de contratación para empezar a cargar tarifas y compararlas. (Fase 2)"
      />
    </div>
  );
}
