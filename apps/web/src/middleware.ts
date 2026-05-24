import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/api/auth',
  '/api/webhooks',
  '/api/health',
  '/widget',
  // Páginas legais públicas (LGPD + Meta App Review obrigatórias)
  '/privacidade',
  '/termos',
  '/exclusao-de-dados',
  '/api/lgpd/request',
];

// Edge-safe instance — no DB adapter, just session decoding for the middleware.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL('/login', req.nextUrl);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/webhooks|api/health|_next/static|_next/image|favicon.ico|widget).*)'],
};
