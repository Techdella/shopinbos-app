import { api } from "./api";
import { clockOffset, type CampaignStatus } from "./campaigns-pure";

// Seasonal campaigns (web /home/campaigns): GET/POST /api/app/campaigns, GET/PATCH /api/app/campaigns/:id,
// POST /api/app/campaigns/:id/(pause|resume|end-now|preview-token), GET /api/app/campaigns/countdowns (the home
// card), and a campaign's own code through POST /api/app/marketing/discounts. Every answer carries the server
// time, so the countdowns follow the server's clock, not the phone's.

export interface CampaignDiscount {
  id: string;
  name: string;
  code: string;
  status: string;
  automatic: boolean;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  preset: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  pausedAt: string | null;
  archivedAt: string | null;
  endingSoonHours: number;
  discountId: string | null;
  discountAutoToggle: boolean;
  status: CampaignStatus;
  discount: CampaignDiscount | null;
  revenue: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDetail extends CampaignSummary {
  /** Drafts made from a preset: the dates the preset suggests (not saved yet). */
  suggested: { startsAt: string; endsAt: string } | null;
}

export interface CampaignCountdown {
  key: string;
  source: "campaign" | "popup" | "section";
  name: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  href: string;
  campaignId?: string;
}

/** Calls the API and works out the server clock's lead over the phone from the answer's serverNow. */
async function timed<T extends { serverNow?: string }>(path: string, init?: Parameters<typeof api>[1]): Promise<T & { offset: number }> {
  const sentAt = Date.now();
  const data = await api<T>(path, init);
  return { ...data, offset: clockOffset(data.serverNow, sentAt, Date.now()) };
}

export const fetchCampaigns = () => timed<{ campaigns: CampaignSummary[]; serverNow: string }>("/api/app/campaigns");

export const fetchCampaign = (id: string) => timed<{ campaign: CampaignDetail; serverNow: string }>(`/api/app/campaigns/${encodeURIComponent(id)}`);

export const fetchCountdowns = () => timed<{ items: CampaignCountdown[]; serverNow: string }>("/api/app/campaigns/countdowns");

/** A draft from a preset (the web does the same when a preset card is tapped). */
export const createCampaign = (preset: string) => api<{ campaign: CampaignDetail }>("/api/app/campaigns", { method: "POST", json: { preset } });

export interface CampaignPatch {
  name?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  discountId?: string | null;
  discountAutoToggle?: boolean;
}

export const updateCampaign = (id: string, patch: CampaignPatch) => api<{ campaign: CampaignDetail }>(`/api/app/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

export type CampaignAction = "pause" | "resume" | "end-now";

export const runCampaignAction = (id: string, action: CampaignAction) => api<{ campaign: CampaignSummary }>(`/api/app/campaigns/${encodeURIComponent(id)}/${action}`, { method: "POST", json: {} });

/** A private link (7 days) that shows the shop as if the campaign were on. */
export const campaignPreviewLink = (id: string) => api<{ url: string; path: string }>(`/api/app/campaigns/${encodeURIComponent(id)}/preview-token`, { method: "POST", json: {} });

/** A percent-off code that only works in the campaign's window; the campaign switches it on and off. */
export const createCampaignCode = (input: { name: string; code: string; percent: number; startsAt: string; endsAt: string }) =>
  api<{ id: string; code: string }>("/api/app/marketing/discounts", {
    method: "POST",
    json: { name: input.name, code: input.code, type: "percentage", value: input.percent, startsAt: input.startsAt, expiresAt: input.endsAt, status: "active" },
  });
