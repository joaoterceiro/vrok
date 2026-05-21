import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraId from 'next-auth/providers/microsoft-entra-id';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db, users } from '@zora/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authConfig } from './auth.config';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: 'admin' | 'supervisor' | 'agent';
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'admin' | 'supervisor' | 'agent';
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const providers: Parameters<typeof NextAuth>[0]['providers'] = [
  Credentials({
    name: 'Email e senha',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Senha', type: 'password' },
    },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;
      const found = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (!found || !found.passwordHash || !found.isActive) return null;
      const ok = await bcrypt.compare(password, found.passwordHash);
      if (!ok) return null;
      return {
        id: found.id,
        email: found.email,
        name: found.name ?? null,
        image: found.image ?? null,
        role: found.role,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  providers.push(
    MicrosoftEntraId({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt' },
  providers,
});
