const PROD_URL = "https://app.shopinbos.com";

const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? PROD_URL,
  marketplaceApiUrl:
    process.env.NEXT_PUBLIC_MARKETPLACE_API_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? PROD_URL}/api/public`,
};

export function getPublicEnv() {
  return publicEnv;
}

export function hasSupabaseBrowserEnv() {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
