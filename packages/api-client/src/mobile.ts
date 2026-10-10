import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import type { SessionDto } from '@shopinbos/validation';
import { createApiClient } from './client';

export interface MobileAuthOptions {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Secure storage adapter (expo-secure-store) so tokens never sit in plain AsyncStorage. */
  storage: SupportedStorage;
}

/**
 * Supabase session + API client for the Expo apps.
 * Sign-in goes through our API (/api/auth/otp/*) so rate limits and lockouts apply;
 * the returned tokens are handed to Supabase, which refreshes them.
 */
export function createMobileAuth({
  apiUrl,
  supabaseUrl,
  supabaseAnonKey,
  storage,
}: MobileAuthOptions) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const api = createApiClient({
    baseUrl: apiUrl,
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token,
  });

  return {
    supabase,
    api,
    async setSession(s: SessionDto) {
      const { error } = await supabase.auth.setSession({
        access_token: s.accessToken,
        refresh_token: s.refreshToken,
      });
      if (error) throw error;
    },
    signOut: () => supabase.auth.signOut(),
  };
}

export type MobileAuth = ReturnType<typeof createMobileAuth>;
