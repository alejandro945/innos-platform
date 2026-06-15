import type { Role } from "@prisma/client";

/**
 * Maps Microsoft Entra ID group display names (or ids) to application roles.
 * Configure the group ids/names to match your Entra ID tenant.
 */
export const ENTRA_GROUP_TO_ROLE: Record<string, Role> = {
  "INOOS-Admins": "ADMIN",
  "INOOS-Analistas": "PROCUREMENT_ANALYST",
  "INOOS-Revisores": "REVIEWER",
  "INOOS-Proveedores": "PROVIDER_MANAGER",
  "INOOS-Consulta": "VIEWER",
};

/** Spanish labels for roles (UI). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  PROCUREMENT_ANALYST: "Analista de contratación",
  REVIEWER: "Revisor",
  PROVIDER_MANAGER: "Gestor de proveedores",
  VIEWER: "Consulta",
};

/** Permission checks used across server actions and route guards. */
export const PERMISSIONS = {
  manageUsers: (roles: Role[]) => roles.includes("ADMIN"),
  manageCatalog: (roles: Role[]) => roles.includes("ADMIN"),
  manageProviders: (roles: Role[]) =>
    roles.some((r) => r === "ADMIN" || r === "PROVIDER_MANAGER"),
  runProcesses: (roles: Role[]) =>
    roles.some((r) => r === "ADMIN" || r === "PROCUREMENT_ANALYST"),
  reviewMappings: (roles: Role[]) =>
    roles.some(
      (r) => r === "ADMIN" || r === "PROCUREMENT_ANALYST" || r === "REVIEWER",
    ),
  viewReports: (_roles: Role[]) => true,
} as const;

export function hasAnyRole(roles: Role[] | undefined, ...allowed: Role[]) {
  if (!roles) return false;
  return roles.some((r) => allowed.includes(r));
}
