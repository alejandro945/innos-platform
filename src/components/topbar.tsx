import { signOut } from "@/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { LogOut } from "lucide-react";

type TopbarProps = {
  name: string | null | undefined;
  email: string | null | undefined;
  roles: Role[];
};

export function Topbar({ name, email, roles }: TopbarProps) {
  const roleLabel =
    roles.length > 0
      ? roles.map((r) => ROLE_LABELS[r]).join(", ")
      : "Sin rol asignado";

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="md:hidden">
        <span className="font-semibold text-slate-900">INOOS</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-slate-900">
            {name ?? email ?? "Usuario"}
          </p>
          <p className="text-xs text-slate-500">{roleLabel}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/iniciar-sesion" });
          }}
        >
          <button
            type="submit"
            title="Cerrar sesión"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </form>
      </div>
    </header>
  );
}
