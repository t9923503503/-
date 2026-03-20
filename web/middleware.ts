import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /sudyam/login — публичный, пускаем без проверки
  if (!pathname.startsWith('/sudyam') || pathname.startsWith('/sudyam/login')) {
    return NextResponse.next();
  }

  // Проверяем наличие cookie (хэш проверяется на уровне page через getAuthStatus)
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/sudyam/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/sudyam', '/sudyam/:path*'],
};
