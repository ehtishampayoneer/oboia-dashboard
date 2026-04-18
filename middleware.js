import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const publicPaths = ['/login', '/_next', '/favicon.ico', '/api'];
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublic) {
    return NextResponse.next();
  }

  // Check for session cookie (we store a simple session indicator)
  const session = request.cookies.get('wallar_session');

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  const adminOnlyPaths = ['/shops', '/settings'];
  const isAdminOnly = adminOnlyPaths.some((path) => pathname.startsWith(path));

  if (isAdminOnly) {
    const role = request.cookies.get('wallar_role')?.value;
    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
