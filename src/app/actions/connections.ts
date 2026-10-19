"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { mergeBrandSettings } from "@/lib/workspace";
import { parseCookieBannerForm } from "@/lib/storefront/consent";
import { finishGoogleSetup } from "@/lib/google/connect.server";
import { disconnectPlatform } from "@/lib/sales-channels/server";

// Connections (/home/connections). Only the signed-in seller's own store is changed. Accounts connect by signing
// in (src/lib/google/connect.server.ts, src/lib/sales-channels); nothing here takes pasted IDs.

async function sellerAndStore() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) redirect("/onboarding?role=seller");
  return store;
}

/** The cookie notice shoppers see before visitor-stats tags load (src/lib/storefront/consent.ts). */
export async function saveCookieNotice(formData: FormData) {
  const store = await sellerAndStore();
  const cookieBanner = parseCookieBannerForm((name) => formData.get(name));
  if (cookieBanner) await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { cookieBanner: { ...cookieBanner } }) } });
  redirect("/home/connections?saved=1#cookies");
}

/** "Finish setting up" on the Google card: reviews, search and visitor stats again (e.g. once the shop is live). */
export async function finishGoogleSetupAction() {
  const store = await sellerAndStore();
  await finishGoogleSetup(store.id);
  redirect("/home/connections?finished=google#google");
}

export async function disconnectGoogleAction() {
  const store = await sellerAndStore();
  await disconnectPlatform(store.id, "google");
  redirect("/home/connections#google");
}
