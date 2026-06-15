/**
 * Ensures the default organization and the local admin user (with ADMIN role)
 * exist — useful right after `migrate deploy` so you don't depend on a login.
 * Reads LOCAL_ADMIN_EMAIL (defaults to admin@inoos.local).
 *   pnpm db:seed-admin
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.LOCAL_ADMIN_EMAIL || "admin@inoos.local")
    .toLowerCase()
    .trim();

  const org = await prisma.organization.upsert({
    where: { nit: "INOOS-DEFAULT" },
    update: {},
    create: { name: "INOOS SAS", nit: "INOOS-DEFAULT" },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Administrador", organizationId: org.id },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: "ADMIN" } },
    update: {},
    create: { userId: user.id, role: "ADMIN" },
  });

  console.log(`Admin listo: ${email} (org ${org.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
