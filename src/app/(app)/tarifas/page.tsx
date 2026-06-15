import { PageHeader, EmptyState } from "@/components/ui";

export default function TarifasPage() {
  return (
    <div>
      <PageHeader title="Repositorio de tarifas" subtitle="Valores vigentes por proveedor, con exclusiones y vigencia." />
      <EmptyState
        title="Sin tarifas cargadas"
        description="Importe el repositorio actual o cargue tarifas desde un proceso. (Fase 1)"
      />
    </div>
  );
}
