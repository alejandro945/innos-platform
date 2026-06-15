import { PageHeader, EmptyState } from "@/components/ui";

export default function CatalogoPage() {
  return (
    <div>
      <PageHeader title="Catálogo canónico" subtitle="Ítems y códigos estándar (CUPS, CUM, ATC)." />
      <EmptyState
        title="Catálogo vacío"
        description="Defina los ítems canónicos contra los que se homologan los servicios y productos. (Fase 1)"
      />
    </div>
  );
}
