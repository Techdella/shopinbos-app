import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { parseOnboardingMemory } from "@/lib/onboarding-memory";
import { CHECKLIST, type ChecklistKey } from "@shared/onboarding";

// What the redesigned seller onboarding (web and mobile) needs to render: the store, its link,
// launch billing, and the "Finish setting up" checklist.

/** Checklist items the app can't detect yet; the seller ticks them off by hand ("id" ticks itself from the ID check). */
export const MANUAL_CHECKLIST_KEYS: ChecklistKey[] = ["wa", "ig", "labels"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getSellerOnboardingStatus(userId: string) {
  const store = await db.store.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      customDomain: true,
      onboardingState: true,
      firstDashboardVisitComplete: true,
      brandSettings: true,
      user: { select: { name: true } },
      _count: { select: { storeProducts: true } },
    },
  });
  if (!store) return null;
  const walletBank = Boolean(await db.wallet.findFirst({ where: { userId, subaccountStatus: { in: ["active", "review"] } }, select: { id: true } }));

  const settings = record(store.brandSettings);
  const editor = record(settings.editor);
  const manual = record(record(settings.setup).checklist);
  const channels = Array.isArray(settings.connectedChannels) ? settings.connectedChannels : [];
  // Store.status defaults to "active", so it alone doesn't mean the seller has launched.
  const live = store.onboardingState === "LIVE" || (store.status === "active" && Boolean(editor.published));

  const done: Record<ChecklistKey, boolean> = {
    live,
    product: store._count.storeProducts > 0,
    brand: Boolean(editor.draft || editor.published || settings.template),
    bank: Boolean(record(settings.payoutBank).paystackRecipientCode || record(settings.payoutBank).accountNumberMask) || walletBank,
    wa: channels.includes("whatsapp") || manual.wa === true,
    ig: channels.includes("instagram") || channels.includes("tiktok") || manual.ig === true,
    labels: manual.labels === true,
  };

  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      status: store.status,
      live,
      url: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }),
    },
    ownerName: store.user.name,
    /** True once the seller has left onboarding for the dashboard (finished or skipped). */
    finished: store.firstDashboardVisitComplete,
    memory: parseOnboardingMemory(settings.onboardingMemory) ?? null,
    productCount: store._count.storeProducts,
    /** The Shopinbos Wallet ID check (NIN or BVN): optional for sellers, offered in onboarding and the top bar. */
    checklist: CHECKLIST.map((item) => ({ ...item, done: done[item.key], manual: MANUAL_CHECKLIST_KEYS.includes(item.key) })),
  };
}

export type SellerOnboardingStatus = NonNullable<Awaited<ReturnType<typeof getSellerOnboardingStatus>>>;
