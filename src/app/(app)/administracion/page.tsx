import { PageHeader, EmptyState } from "@/components/ui";

export default function AdministracionPage() {
  return (
    <div>
      <PageHeader title="Administración" subtitle="Usuarios, roles, configuración y auditoría." />
      <EmptyState
        title="Configuración"
        description="Gestión de usuarios y roles vía Microsoft Entra ID, y registro de auditoría. (Fase 6)"
      />
    </div>
  );
}
