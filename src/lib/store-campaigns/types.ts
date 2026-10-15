// What the seller pages get from /api/app/campaigns (plain JSON). Type-only.

import type { CampaignStatus } from "./status.ts";
import type { CampaignSectionOverride, CampaignThemeOverride } from "./merge.ts";
import type { CampaignBlockType } from "./blocks.ts";

export interface CampaignDiscountSummary {
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
  priority: number;
  pausedAt: string | null;
  archivedAt: string | null;
  endingSoonHours: number;
  discountId: string | null;
  discountAutoToggle: boolean;
  status: CampaignStatus;
  discount: CampaignDiscountSummary | null;
  /** Block types switched on (for the list's little icons). */
  blockTypes: CampaignBlockType[];
  hasOverrides: boolean;
  /** Sales during the campaign window so far (paid orders). */
  revenue: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignBlockDTO {
  id: string;
  type: CampaignBlockType;
  enabled: boolean;
  settings: Record<string, unknown>;
  targeting: Record<string, unknown>;
  sortOrder: number;
}

export interface CampaignPopupForm {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}

export interface CampaignWarnings {
  /** Other campaigns with look changes whose dates overlap this one. */
  overlaps: Array<{ id: string; name: string; priority: number }>;
  /** The linked discount's own dates don't cover the campaign. */
  discountMismatch: boolean;
  /** Section changes whose section is no longer in the store. */
  orphaned: string[];
}

export interface CampaignDetail extends CampaignSummary {
  themeOverride: CampaignThemeOverride;
  sectionOverrides: CampaignSectionOverride[];
  blocks: CampaignBlockDTO[];
  popupForms: CampaignPopupForm[];
  warnings: CampaignWarnings;
  /** Drafts made from a preset: the dates the preset suggests (filled into the date pickers, not saved). */
  suggested: { startsAt: string; endsAt: string } | null;
}

/** A countdown shown in the seller backend: a campaign, or a countdown pop-up or section outside campaigns. */
export interface BackendCountdown {
  key: string;
  source: "campaign" | "popup" | "section";
  name: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  href: string;
  /** Campaigns only. */
  campaignId?: string;
}

export interface CampaignAnalytics {
  window: { from: string; to: string } | null;
  previous: { from: string; to: string } | null;
  sessions: number;
  blockViews: number;
  clicks: number;
  popupShown: number;
  popupClosed: number;
  popupConverted: number;
  emails: number;
  orders: number;
  revenue: number;
  discountOrders: number;
  discountRevenue: number;
  previousOrders: number;
  previousRevenue: number;
}
