import NextAuth from "next-auth";
import type { Role } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { ENTRA_GROUP_TO_ROLE } from "@/lib/rbac";

const DEFAULT_ROLE: Role = "VIEWER";
const DEFAULT_ORG_NAME = "INOOS SAS";

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
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // Runs on sign-in (account present): provision/sync the user in our DB.
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
