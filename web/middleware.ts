import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-constants';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isSudyam = pathname.startsWith('/sudyam');
  const isSudyamLogin = pathname.startsWith('/sudyam/login');
  if (isSudyam && !isSudyamLogin) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/sudyam/login', request.url));
    }
  }

  const isAdmin = pathname.startsWith('/admin');
  const isAdminLogin = pathname.startsWith('/admin/login');
  if (isAdmin && !isAdminLogin) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/sudyam', '/sudyam/:path*', '/admin', '/admin/:path*'],
};
