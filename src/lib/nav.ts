import {
  LayoutDashboard,
  FileStack,
  Table2,
  Building2,
  BookMarked,
  BarChart3,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

// Spanish navigation (UI). Routes use Spanish slugs.
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Inicio",
    href: "/",
    icon: LayoutDashboard,
    description: "Resumen e indicadores",
  },
  {
    label: "Procesos de contratación",
    href: "/procesos",
    icon: FileStack,
    description: "Cargar archivos y comparar",
  },
  {
    label: "Repositorio de tarifas",
    href: "/tarifas",
    icon: Table2,
    description: "Valores vigentes por proveedor",
  },
  {
    label: "Proveedores",
    href: "/proveedores",
    icon: Building2,
    description: "Administrar proveedores",
  },
  {
    label: "Catálogo canónico",
    href: "/catalogo",
    icon: BookMarked,
    description: "Ítems y códigos estándar",
  },
  {
    label: "Análisis",
    href: "/analisis",
    icon: Sparkles,
    description: "Anomalías, ahorro y búsqueda IA",
  },
  {
    label: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    description: "Exportar comparaciones",
  },
  {
    label: "Administración",
    href: "/administracion",
    icon: Settings,
    description: "Usuarios, roles y auditoría",
  },
];
