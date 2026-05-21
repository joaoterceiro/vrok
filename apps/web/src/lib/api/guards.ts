import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * Wraps a route handler so it auto-401s when there's no session and provides
 * the session to the handler.
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return session;
}
