/** Server-side env access. Throws a clear error when a required var is missing. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. See .env.example.`);
  return v;
}

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  storeRootDomain: process.env.NEXT_PUBLIC_STORE_ROOT_DOMAIN ?? 'shopinbos.com',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  // Publishable key (sb_publishable_…), or the legacy anon JWT.
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '',
};
