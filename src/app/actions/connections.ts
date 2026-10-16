"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { mergeBrandSettings, parseBrandSettings } from "@/lib/workspace";
import { parseIntegrationsForm } from "@/lib/storefront/integrations";
import { parseCookieBannerForm } from "@/lib/storefront/consent";
import { chooseSearchConsoleSite, disconnectSearchConsole } from "@/lib/search-console/google.server";

// Settings › Connections (/home/connections). Only the signed-in seller's own store is changed; every ID is checked
// against its exact format (src/lib/security/html.ts) and a malformed one is refused with the field named.

async function sellerAndStore() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) redirect("/onboarding?role=seller");
  return store;
}

export async function saveConnections(formData: FormData) {
  const store = await sellerAndStore();
  const { values, invalid } = parseIntegrationsForm((name) => formData.get(name));
  const current = parseBrandSettings(store.brandSettings).integrations;
  const others = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  // The valid ones are saved; a malformed one keeps its previous value and the page names it.
  const valid = Object.fromEntries(Object.entries(values).filter(([key]) => !(invalid as string[]).includes(key)));
  // The cookie banner shoppers see before the tags load (src/lib/storefront/consent.ts): on/off, message, policy link.
  const cookieBanner = parseCookieBannerForm((name) => formData.get(name));
  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: mergeBrandSettings(store.brandSettings, { integrations: { ...others, ...valid }, ...(cookieBanner ? { cookieBanner: { ...cookieBanner } } : {}) }) },
  });
  redirect(invalid.length ? `/home/connections?invalid=${encodeURIComponent(invalid.join(","))}` : "/home/connections?saved=1");
}

export async function chooseSearchConsoleProperty(formData: FormData) {
  const store = await sellerAndStore();
  const siteUrl = String(formData.get("siteUrl") ?? "");
  try {
    await chooseSearchConsoleSite(store.id, siteUrl);
  } catch {
    redirect("/home/connections?google=bad_site#search-console");
  }
  redirect("/home/connections?google=connected#search-console");
}

export async function disconnectSearchConsoleAction() {
  const store = await sellerAndStore();
  await disconnectSearchConsole(store.id);
  redirect("/home/connections?google=disconnected#search-console");
}
