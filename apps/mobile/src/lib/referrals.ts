import { api } from "./api";
import { optional } from "./familiar";

// Refer & earn (GET /api/mobile/referrals, the web's Refer & earn page data). Null when the server doesn't have it
// yet, so the Rewards screen just leaves the card out. Rewards are free months or AI credits, never cash.

export type ReferralRole = "seller" | "supplier" | "logistics_partner";

export interface Referrals {
  code: string;
  link: string;
  role: ReferralRole;
  offers: Array<{ role: ReferralRole; months: number; credits: number }>;
  counts: { joined: number; rewarded: number; waiting: number };
  earned: { months: number; credits: number };
  freeUntil: string | null;
  referrals: Array<{ id: string; name: string; avatarUrl: string | null; role: ReferralRole; status: "signed_up" | "qualified" | "rewarded" | "rejected" | string; joinedAt: string }>;
}

export const fetchReferrals = () => optional(api<Referrals>("/api/mobile/referrals"));
