"use client";

import { createContext, useContext } from "react";
import type { CampaignBadgeView, StorefrontCampaignInfo, StorefrontCampaignView } from "@/lib/store-campaigns/storefront.server";

// The live (or previewed) seasonal campaigns on a storefront page, from the storefront layout. Product cards read
// their badges here and campaign sections their timer and discount code. Null on stores with no campaign.

export interface CampaignContextValue {
  view: StorefrontCampaignView;
  slug: string;
  basePath: string;
  /** Preview at a chosen time: how far the pretend clock is ahead of the real one (0 normally). */
  shiftMs: number;
}

export const CampaignContext = createContext<CampaignContextValue | null>(null);

export function useStoreCampaigns() {
  return useContext(CampaignContext);
}

/** The campaign whose look shows (its timer and code drive campaign sections), else the first live one. */
export function useSectionCampaign(): StorefrontCampaignInfo | null {
  const value = useContext(CampaignContext);
  if (!value) return null;
  const { campaigns, themeCampaignId } = value.view;
  return campaigns.find((campaign) => campaign.id === themeCampaignId) ?? campaigns[0] ?? null;
}

/** The time countdowns should use: the server clock, moved to the chosen moment while previewing at a time. */
export function useCampaignClock(serverNow: number) {
  const value = useContext(CampaignContext);
  return serverNow > 0 ? serverNow + (value?.shiftMs ?? 0) : 0;
}

export function useProductBadges(productId: string | null | undefined): CampaignBadgeView[] {
  const value = useContext(CampaignContext);
  if (!value || !productId) return [];
  return value.view.badges[productId] ?? [];
}
