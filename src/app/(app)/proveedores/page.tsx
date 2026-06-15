import { PageHeader, EmptyState } from "@/components/ui";

export default function ProveedoresPage() {
  return (
    <div>
      <PageHeader title="Proveedores" subtitle="Administre los proveedores y su historial de cargas." />
      <EmptyState
        title="Sin proveedores"
        description="Agregue proveedores para asociar sus tarifarios. (Fase 1)"
      />
    </div>
  );
}
