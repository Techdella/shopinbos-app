// Request bodies for /api/app/campaigns/** and the storefront events endpoint.

import { z } from "zod";
import { BLOCK_TYPES } from "./blocks.ts";
import { PRESET_IDS } from "./presets.ts";
import { isValidTimeZone } from "./time.ts";

const isoOrNull = z
  .union([z.string().max(40), z.null()])
  .refine((value) => value === null || Number.isFinite(Date.parse(value)), { message: "Pick a valid date and time" });

export const CreateCampaignSchema = z.object({
  preset: z.enum(PRESET_IDS).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const UpdateCampaignSchema = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name").max(120),
    startsAt: isoOrNull,
    endsAt: isoOrNull,
    timezone: z.string().max(64).refine(isValidTimeZone, { message: "Pick a time zone from the list" }),
    priority: z.number().int().min(-100).max(100),
    endingSoonHours: z.number().int().min(0).max(720),
    discountId: z.union([z.string().min(1).max(64), z.null()]),
    discountAutoToggle: z.boolean(),
    themeOverride: z.record(z.string(), z.unknown()),
    sectionOverrides: z.array(z.unknown()).max(60),
  })
  .partial()
  .refine((value) => !(value.startsAt && value.endsAt) || Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "The end must be after the start",
    path: ["endsAt"],
  });

export const CreateBlockSchema = z.object({
  type: z.enum(BLOCK_TYPES),
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateBlockSchema = z.object({
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  targeting: z.record(z.string(), z.unknown()).optional(),
});

export const CAMPAIGN_EVENTS = ["page_view", "block_view", "block_click", "popup_shown", "popup_closed", "popup_converted"] as const;
export type CampaignEventName = (typeof CAMPAIGN_EVENTS)[number];

export const CampaignEventsSchema = z.object({
  sessionId: z.string().max(64).regex(/^[\w-]*$/).optional(),
  events: z
    .array(
      z.object({
        campaignId: z.string().min(1).max(64),
        blockId: z.string().max(64).optional().nullable(),
        event: z.enum(CAMPAIGN_EVENTS),
      }),
    )
    .min(1)
    .max(30),
});
