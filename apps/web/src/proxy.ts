import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveHost } from './lib/hosts';

/**
 * Multi-tenant routing (SPEC 11.1).
 * App hosts get the app plus a Supabase session refresh; store hosts are rewritten to /_store/{key}/...
 */
export async function proxy(req: NextRequest) {
  const root = process.env.NEXT_PUBLIC_STORE_ROOT_DOMAIN ?? 'shopinbos.com';
  const host = resolveHost(req.headers.get('host'), root);
  const { pathname, search } = req.nextUrl;

  if (host.kind === 'store' || host.kind === 'custom') {
    const key = host.kind === 'store' ? `slug:${host.slug}` : `host:${host.hostname}`;
    const url = req.nextUrl.clone();
    url.pathname = `/_store/${encodeURIComponent(key)}${pathname === '/' ? '' : pathname}`;
    url.search = search;
    return NextResponse.rewrite(url);
  }

  if (host.kind === 'reserved') {
    return new NextResponse('Not found', { status: 404 });
  }

  // App host: block direct hits on the internal store route, then refresh the auth session cookie.
  if (pathname.startsWith('/_store')) return new NextResponse('Not found', { status: 404 });
  if (pathname.startsWith('/api/')) return NextResponse.next();
  return refreshSession(req);
}

async function refreshSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all) => {
        for (const { name, value } of all) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of all) res.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|txt)$).*)',
  ],
};
