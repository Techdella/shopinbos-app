import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { publicEnv } from '../env';

/** Cookie-bound client for route handlers and server components (web sessions). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          for (const { name, value, options } of all) store.set(name, value, options);
        } catch {
          // Called from a server component: cookies are read-only there; the proxy refreshes them.
        }
      },
    },
  });
}

/** Stateless client (no cookies) for verifying bearer tokens from mobile apps. */
export function supabaseStateless() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
