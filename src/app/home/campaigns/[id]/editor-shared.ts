"use client";

import type { StoreEditorSnapshot, ThemeTokenSet } from "@/lib/store-templates/types";
import type { CampaignDetail } from "@/lib/store-campaigns/types";
import { isRunningStatus, computeCampaignStatus } from "@/lib/store-campaigns/status";
import { api } from "../../marketing/_kit/client";

export interface EditorStore {
  name: string;
  slug: string;
  logoUrl: string | null;
  host: string;
  renderer: "boutique" | "classic";
  themeId: string;
  baseTokens: ThemeTokenSet | null;
  /** The store's published design (the draft when nothing is published yet); never changed by a campaign. */
  snapshot: StoreEditorSnapshot | null;
  products: Array<{ id: string; name: string; images: string[]; retailPrice: number; compareAtPrice: number | null; currency: string }>;
  collections: Array<{ id: string; name: string }>;
  discounts: Array<{ id: string; name: string; code: string; status: string; automatic: boolean; startsAt: string | null; expiresAt: string | null }>;
  /** The store's other pop-ups, which can join the campaign. */
  popups: Array<{ id: string; name: string }>;
}

export interface EditorProps {
  campaign: CampaignDetail;
  store: EditorStore;
  /** Saves through the API and takes the campaign it returns; asks first when the campaign is live. */
  save: (path: string, method: string, body?: unknown, options?: { confirmLive?: boolean }) => Promise<CampaignDetail | null>;
  busy: boolean;
}

export function campaignIsRunning(campaign: CampaignDetail) {
  return isRunningStatus(computeCampaignStatus(campaign));
}

export async function campaignRequest(path: string, method: string, body?: unknown) {
  const data = await api<{ campaign: CampaignDetail; serverNow: string }>(path, method, body);
  return data;
}
