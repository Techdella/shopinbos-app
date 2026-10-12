"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, hasSupabaseBrowserEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!hasSupabaseBrowserEnv()) return null;
  if (!browserClient) {
    const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
    // Secure on https pages, like the server-set session cookies (src/lib/auth/session.server.ts).
    const secure = typeof window !== "undefined" && window.location.protocol === "https:";
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, { cookieOptions: { path: "/", sameSite: "lax", secure } });
  }
  return browserClient;
}
