import "server-only";

import { db } from "@/lib/db/client";

// Everything else businesses buy from Shopinbos (Admin › Wallets › Shopinbos fees › Purchases): themes, domains, plan
// add-ons (staff seats, message packs, boosts), CAC business name registration, ad setup and print orders. Only paid
// ones count: refunded domains and registrations, domains free with a plan, add-ons included in a plan and cancelled
// print orders are left out. Subscriptions and AI credits have their own sections (platform-fees.server.ts).

const DAY = 24 * 60 * 60 * 1000;
const TAKE = 5000;

export type PurchaseCategory = "theme" | "domain" | "extra" | "registration" | "ads" | "print";

export const PURCHASE_LABEL: Record<PurchaseCategory, string> = {
  theme: "Themes",
  domain: "Domains",
  extra: "Add-ons",
  registration: "CAC registration",
  ads: "Ad setup",
  print: "Print orders",
};

const EXTRA_LABEL: Record<string, string> = {
  staff_seat: "Staff seat",
  sms_pack: "SMS pack",
  whatsapp_pack: "WhatsApp pack",
  supplier_boost: "Supplier boost",
  product_boost: "Product boost",
  logistics_boost: "Delivery boost",
};

interface Row {
  id: string;
  category: PurchaseCategory;
  item: string;
  userId: string;
  at: Date;
  amountKobo: number;
}

export interface PurchaseSummary {
  categories: Array<{ category: PurchaseCategory; label: string; today: number; week: number; month: number; all: number; count: number }>;
  totals: { today: number; week: number; month: number; all: number; count: number };
  latest: Array<{ id: string; category: PurchaseCategory; item: string; who: string; email: string | null; at: string; amountKobo: number }>;
}

export async function purchaseSummary(now = new Date(), limit = 40): Promise<PurchaseSummary> {
  const [themes, domains, extras, registrations, ads, prints] = await Promise.all([
    db.themePurchase.findMany({ where: { status: "paid" }, orderBy: { paidAt: "desc" }, take: TAKE, select: { reference: true, userId: true, themeId: true, tier: true, amountKobo: true, paidAt: true, createdAt: true } }),
    db.domainPurchase.findMany({
      where: { paidAt: { not: null }, coveredByPlan: false, status: { notIn: ["refunded", "pending_payment", "payment_failed"] } },
      orderBy: { paidAt: "desc" },
      take: TAKE,
      select: { id: true, userId: true, domain: true, kind: true, years: true, amountNgn: true, paidAt: true },
    }),
    db.planExtraPurchase.findMany({ where: { status: "paid", included: false, amountKobo: { gt: 0 } }, orderBy: { paidAt: "desc" }, take: TAKE, select: { reference: true, userId: true, kind: true, quantity: true, amountKobo: true, paidAt: true, createdAt: true } }),
    db.businessRegistration.findMany({ where: { paidAt: { not: null }, status: { notIn: ["refunded"] } }, orderBy: { paidAt: "desc" }, take: TAKE, select: { id: true, userId: true, proposedName: true, amountNgn: true, paidAt: true } }),
    db.adServiceRequest.findMany({ where: { paidAt: { not: null } }, orderBy: { paidAt: "desc" }, take: TAKE, select: { id: true, userId: true, platform: true, setupFee: true, paidAt: true } }),
    db.printOrder.findMany({ where: { paidAt: { not: null }, status: { not: "cancelled" } }, orderBy: { paidAt: "desc" }, take: TAKE, select: { id: true, userId: true, title: true, quantity: true, total: true, paidAt: true } }),
  ]);

  const rows: Row[] = [
    ...themes.map((row) => ({ id: `theme:${row.reference}`, category: "theme" as const, item: `${row.themeId} (${row.tier})`, userId: row.userId, at: row.paidAt ?? row.createdAt, amountKobo: row.amountKobo })),
    ...domains.map((row) => ({ id: `domain:${row.id}`, category: "domain" as const, item: `${row.domain}${row.kind === "renewal" ? " · renewal" : ""}${row.years > 1 ? ` · ${row.years} years` : ""}`, userId: row.userId, at: row.paidAt!, amountKobo: row.amountNgn * 100 })),
    ...extras.map((row) => ({ id: `extra:${row.reference}`, category: "extra" as const, item: `${EXTRA_LABEL[row.kind] ?? row.kind}${row.quantity > 1 ? ` × ${row.quantity}` : ""}`, userId: row.userId, at: row.paidAt ?? row.createdAt, amountKobo: row.amountKobo })),
    ...registrations.map((row) => ({ id: `registration:${row.id}`, category: "registration" as const, item: row.proposedName, userId: row.userId, at: row.paidAt!, amountKobo: row.amountNgn * 100 })),
    ...ads.map((row) => ({ id: `ads:${row.id}`, category: "ads" as const, item: row.platform === "tiktok" ? "TikTok ads setup" : "Facebook & Instagram ads setup", userId: row.userId, at: row.paidAt!, amountKobo: row.setupFee * 100 })),
    ...prints.map((row) => ({ id: `print:${row.id}`, category: "print" as const, item: `${row.title} × ${row.quantity}`, userId: row.userId, at: row.paidAt!, amountKobo: row.total * 100 })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const since = { today: startOfToday.getTime(), week: now.getTime() - 7 * DAY, month: now.getTime() - 30 * DAY, all: 0 };
  const sum = (list: Row[], from: number) => list.reduce((total, row) => total + (row.at.getTime() >= from ? row.amountKobo : 0), 0);
  const tally = (list: Row[]) => ({ today: sum(list, since.today), week: sum(list, since.week), month: sum(list, since.month), all: sum(list, since.all), count: list.length });

  const latest = rows.slice(0, limit);
  const buyers = new Map(
    (await db.user.findMany({ where: { id: { in: [...new Set(latest.map((row) => row.userId))] } }, select: { id: true, name: true, email: true } })).map((user) => [user.id, user]),
  );
  return {
    categories: (Object.keys(PURCHASE_LABEL) as PurchaseCategory[]).map((category) => ({ category, label: PURCHASE_LABEL[category], ...tally(rows.filter((row) => row.category === category)) })),
    totals: tally(rows),
    latest: latest.map((row) => ({
      id: row.id,
      category: row.category,
      item: row.item,
      who: buyers.get(row.userId)?.name ?? "Deleted account",
      email: buyers.get(row.userId)?.email ?? null,
      at: row.at.toISOString(),
      amountKobo: row.amountKobo,
    })),
  };
}
