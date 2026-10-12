import { redirect } from "next/navigation";

// Old tabbed store settings: each tab has its own page in the app now.
const TAB_PAGES: Record<string, string> = {
  domain: "/home/domain",
  brand: "/home/brand-kit",
  commerce: "/home/commerce/cart",
  seo: "/home/seo",
  navigation: "/home/navigation",
  legal: "/home/legal",
};

export default async function SellerStoreSettingsAliasPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const tab = (await searchParams)?.tab ?? "domain";
  redirect(TAB_PAGES[tab] ?? "/home/settings");
}
