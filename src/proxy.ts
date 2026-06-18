import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 "proxy" convention (formerly middleware).
// Edge-safe: uses the DB-free auth config for route protection.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except static assets, the auth + inngest APIs and images.
  // `/api/inngest` must stay public so Inngest can sync/invoke it (no session).
  matcher: [
    "/((?!api/auth|api/inngest|_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
