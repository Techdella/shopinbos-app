const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  marketplaceApiUrl:
    process.env.NEXT_PUBLIC_MARKETPLACE_API_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/public`,
};

export function getPublicEnv() {
  return publicEnv;
}

export function hasSupabaseBrowserEnv() {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
