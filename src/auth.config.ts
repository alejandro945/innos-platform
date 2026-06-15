import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/**
 * Edge-safe auth config: providers + route authorization only.
 * No database access here (used by middleware on the edge runtime).
 */
export const authConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: "openid profile email User.Read" } },
    }),
  ],
  pages: {
    signIn: "/iniciar-sesion",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = nextUrl.pathname.startsWith("/iniciar-sesion");

      if (isAuthRoute) {
        // Redirect already-authenticated users away from the login page.
        if (isLoggedIn)
          return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      // Everything else requires a session.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
