import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Role } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { ENTRA_GROUP_TO_ROLE } from "@/lib/rbac";

const DEFAULT_ROLE: Role = "VIEWER";
const DEFAULT_ORG_NAME = "INOOS SAS";

export const LOCAL_ADMIN_PROVIDER = "local-admin";

/** Local admin login (dev / no-SSO). Enabled via env credentials. */
export function isLocalAdminEnabled(): boolean {
  return Boolean(
    process.env.LOCAL_ADMIN_EMAIL && process.env.LOCAL_ADMIN_PASSWORD,
  );
}

/** Resolve app roles from Entra ID group claims (falls back to VIEWER). */
function rolesFromGroups(groups: unknown): Role[] {
  if (!Array.isArray(groups)) return [DEFAULT_ROLE];
  const roles = groups
    .map((g) => ENTRA_GROUP_TO_ROLE[String(g)])
    .filter(Boolean) as Role[];
  return roles.length > 0 ? Array.from(new Set(roles)) : [DEFAULT_ROLE];
}

/** Ensure a single default organization exists (single-tenant bootstrap). */
async function getDefaultOrganizationId(): Promise<string> {
  const org = await prisma.organization.upsert({
    where: { nit: "INOOS-DEFAULT" },
    update: {},
    create: { name: DEFAULT_ORG_NAME, nit: "INOOS-DEFAULT" },
  });
  return org.id;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      id: LOCAL_ADMIN_PROVIDER,
      name: "Administrador local",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(creds) {
        if (!isLocalAdminEnabled()) return null;
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        // Trim env values defensively (Vercel can carry trailing newlines).
        const expectedEmail = process.env
          .LOCAL_ADMIN_EMAIL!.toLowerCase()
          .trim();
        const expectedPassword = process.env.LOCAL_ADMIN_PASSWORD!.trim();
        if (email !== expectedEmail || password.trim() !== expectedPassword) {
          return null; // wrong credentials
        }
        try {
          const organizationId = await getDefaultOrganizationId();
          const user = await prisma.user.upsert({
            where: { email },
            update: {},
            create: { email, name: "Administrador", organizationId },
          });
          await prisma.userRole.upsert({
            where: { userId_role: { userId: user.id, role: "ADMIN" } },
            update: {},
            create: { userId: user.id, role: "ADMIN" },
          });
          return { id: user.id, email: user.email, name: user.name };
        } catch (e) {
          // Surface DB/migration problems in the logs (otherwise it looks like
          // "wrong credentials"). Common cause: prod DB not migrated.
          console.error("[local-admin] DB error during sign-in:", e);
          throw new Error("DB_ERROR");
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile, user }) {
      // Local admin sign-in: load org + roles from DB.
      if (account?.provider === LOCAL_ADMIN_PROVIDER && user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { roles: true },
        });
        token.userId = user.id;
        token.organizationId = dbUser?.organizationId ?? null;
        token.roles = dbUser?.roles.map((r) => r.role) ?? ["ADMIN"];
        return token;
      }

      // OAuth (Entra ID) sign-in: provision/sync the user in our DB.
      if (account && profile) {
        const email = (profile.email ?? profile.preferred_username) as
          | string
          | undefined;
        const entraOid = (profile.oid ?? profile.sub) as string | undefined;
        if (email) {
          const organizationId = await getDefaultOrganizationId();
          const roles = rolesFromGroups(
            (profile as Record<string, unknown>).groups,
          );

          const user = await prisma.user.upsert({
            where: { email },
            update: {
              entraOid,
              name: (profile.name as string) ?? undefined,
            },
            create: {
              email,
              entraOid,
              name: (profile.name as string) ?? null,
              organizationId,
            },
          });

          // Replace role set on each login (groups are the source of truth).
          await prisma.userRole.deleteMany({ where: { userId: user.id } });
          await prisma.userRole.createMany({
            data: roles.map((role) => ({ userId: user.id, role })),
            skipDuplicates: true,
          });

          token.userId = user.id;
          token.organizationId = user.organizationId;
          token.roles = roles;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? "";
        session.user.organizationId =
          (token.organizationId as string | null | undefined) ?? null;
        session.user.roles = (token.roles as Role[] | undefined) ?? [];
      }
      return session;
    },
  },
});
