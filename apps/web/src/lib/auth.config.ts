import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe NextAuth config. Used by middleware and any other code paths that
 * cannot use the Drizzle adapter (which requires Node runtime + postgres).
 *
 * The full config (with adapter and Credentials provider) lives in
 * `auth.ts` and is only loaded from API route handlers and Server Components.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  providers: [], // populated in auth.ts
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? 'agent';
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as 'admin' | 'supervisor' | 'agent') ?? 'agent';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
