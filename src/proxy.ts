import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 "proxy" convention (formerly middleware).
// Edge-safe: uses the DB-free auth config for route protection.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except static assets, the auth API and image files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
