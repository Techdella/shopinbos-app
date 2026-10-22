"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, hasSupabaseBrowserEnv } from "@/lib/env";
import { ensureUsableStorage } from "@/lib/safe-storage";

// Run as soon as this loads too, so storage reads elsewhere on the page are safe.
ensureUsableStorage();

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!hasSupabaseBrowserEnv()) return null;
  if (!browserClient) {
    const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
    // Secure on https pages, like the server-set session cookies (src/lib/auth/session.server.ts).
    const secure = typeof window !== "undefined" && window.location.protocol === "https:";
    // Supabase reads sessionStorage while it starts; some browsers deny it and the read throws.
    ensureUsableStorage();
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, { cookieOptions: { path: "/", sameSite: "lax", secure } });
  }
  return browserClient;
}
