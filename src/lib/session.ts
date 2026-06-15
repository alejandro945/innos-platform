import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export type AppSession = {
  userId: string;
  organizationId: string;
  email: string;
  name: string | null;
  roles: Role[];
};

/** Resolve the current session or redirect to login. Use in server components/actions. */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user || !session.user.id) redirect("/iniciar-sesion");
  if (!session.user.organizationId) {
    // User authenticated but not provisioned to an organization.
    redirect("/iniciar-sesion");
  }
  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    roles: session.user.roles ?? [],
  };
}

/** Like requireSession but also enforces at least one of the allowed roles. */
export async function requireRoles(...allowed: Role[]): Promise<AppSession> {
  const session = await requireSession();
  if (allowed.length > 0 && !session.roles.some((r) => allowed.includes(r))) {
    redirect("/?error=forbidden");
  }
  return session;
}
