import { api, appHeaders } from "./api";

// Pay small small, ajo and group buy (pilots "pay_small_small", "ajo", "group_buy"; web: the product page's "Other ways
// to buy" card, /home/pay-small, /home/ajo, /home/group-buys). Every call sends the app headers, so the server checks
// the switch for this app. Shopinbos never holds this money: every payment is split straight to the seller's bank.

export type PayOptions = {
  features: { paySmall: boolean; groupBuy: boolean; ajo: boolean };
  walletReady: boolean;
  sellable: boolean;
  dropship: boolean;
  published: boolean;
  price: number;
  variants: Array<{ id: string; name: string; price: number }>;
  option: { paySmallOn: boolean; paySmallWeeks: number[]; priceLock: boolean; refundRule: string; groupBuyOn: boolean; groupPrice: number | null; groupSize: number | null; groupHours: number | null };
};

export type Plan = {
  id: string; status: string; productName: string; variantLabel: string | null; quantity: number; buyerName: string; buyerPhone: string | null; buyerEmail: string;
  weeks: number; paidCount: number; total: number; paid: number; weekly: number; nextDueAt: string | null; autopay: boolean; refundRule: string; refundStatus: string | null; refundNote: string | null; orderId: string | null; createdAt: string;
};
export type Settlement = { planId: string; buyerName: string; productName: string; n: number; weeks: number; amount: number; fee: number; toYou: number; reference: string; via: string; extra: boolean; paidAt: string | null };
export type PlansData = { walletReady: boolean; plans: Plan[]; settlements: Settlement[]; totals: { active: number; completed: number; defaulted: number; received: number; owed: number } };

export type AjoRow = { id: string; productName: string; variantLabel: string | null; size: number; weekly: number; deposit: number; startDay: string; status: string; members: number; week: number; shipped: number; createdAt: string };
export type AjoMember = { id: string; name: string; phone: string; position: number | null; status: string; isNew: boolean; autopay: boolean; collectedWeek: number | null; orderId: string | null; removedReason: string | null; settlement: string | null; paidWeeks: number };
export type AjoDetail = {
  id: string; productName: string; variantLabel: string | null; itemPrice: number; size: number; weekly: number; deposit: number; rules: string; startDay: string; status: string;
  drawSeed: string | null; drawnAt: string | null; orderSetBy: string | null; canReorder: boolean; week: number; shippedWeeks: number[];
  thisWeek: { paid: string[]; missing: string[]; complete: boolean } | null; shipTo: string | null; joinUrl: string | null;
  members: AjoMember[]; settlements: Array<{ memberId: string; week: number; amount: number; deposit: number; fee: number; toYou: number; reference: string; via: string; extra: boolean; paidAt: string | null }>;
};

export type GroupBuy = { id: string; productName: string; variantLabel: string | null; price: number; retail: number; size: number; joined: number; status: string; endsAt: string; createdAt: string; members: Array<{ id: string; name: string; phone: string | null; status: string; orderId: string | null; payDeadline: string | null }> };

export function fetchPayOptions(productId: string) {
  return api<PayOptions>(`/api/app/pay-options/products/${encodeURIComponent(productId)}`, { headers: appHeaders() });
}

export function savePayOptions(productId: string, change: Record<string, unknown>) {
  return api<PayOptions>(`/api/app/pay-options/products/${encodeURIComponent(productId)}`, { method: "PUT", json: change, headers: appHeaders() });
}

export function fetchPlans() {
  return api<PlansData>("/api/app/together?view=plans", { headers: appHeaders() });
}

export function fetchAjoGroups() {
  return api<{ walletReady: boolean; groups: AjoRow[] }>("/api/app/together?view=ajo", { headers: appHeaders() });
}

export function fetchAjoGroup(id: string) {
  return api<AjoDetail>(`/api/app/together/ajo/${encodeURIComponent(id)}`, { headers: appHeaders() });
}

export function fetchGroupBuys() {
  return api<{ walletReady: boolean; groups: GroupBuy[] }>("/api/app/together?view=groups", { headers: appHeaders() });
}

export function togetherAction<T = { ok: true }>(body: Record<string, unknown>) {
  return api<T>("/api/app/together", { method: "POST", json: body, headers: appHeaders() });
}
