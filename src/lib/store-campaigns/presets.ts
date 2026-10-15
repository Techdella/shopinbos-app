// Ready-made seasonal campaigns. Each preset is a complete, editable campaign: suggested dates (in the store's time
// zone), a colour change, sections for the home page (a countdown banner, a deal grid…), an announcement bar with
// the countdown, an exit-intent sale pop-up, product badges and countdown settings. Words are message keys in the
// "campaigns" namespace, filled in the seller's language when the campaign is made (server.ts), so the seller can
// change any of it. Starter words never promise an offer the seller didn't create (no made-up percentages or codes).
// Pure, relative imports only: tests/store-campaigns.test.mjs checks every preset.

import type { ThemeTokenSet } from "../store-templates/types.ts";
import type { CountdownSettings, BadgeSettings } from "./blocks.ts";
import { zonedTime } from "./time.ts";
import type { CampaignSectionOverride } from "./merge.ts";
import { newStoreBlockSection } from "../../components/storefront/boutique/blocks/block-catalog.ts";

export const PRESET_IDS = [
  "black_friday",
  "cyber_monday",
  "christmas",
  "detty_december",
  "new_year",
  "valentine",
  "easter",
  "ramadan_eid",
  "back_to_school",
  "flash_sale",
  "blank",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** Section kinds a campaign adds (ready-made store blocks, src/components/storefront/boutique/blocks). */
export const CAMPAIGN_SECTION_KINDS = ["campaign-countdown-hero", "campaign-deal-grid", "campaign-promo-strip", "campaign-featured-deal", "campaign-gift-guide"] as const;
export type CampaignSectionKind = (typeof CAMPAIGN_SECTION_KINDS)[number];

export interface PresetSection {
  kind: CampaignSectionKind;
  /** Where on the home page, among the body sections (0 = right under the header). */
  index: number;
  /** Copy field → message key. */
  copy: Record<string, string>;
  settings?: Record<string, unknown>;
}

export interface CampaignPreset {
  id: PresetId;
  /** Message keys: preset.<id>.name / .description. */
  nameKey: string;
  descriptionKey: string;
  /** Colours shown on the preset card. */
  swatch: [string, string, string];
  /** Look change (only these keys replace the store's own). */
  tokens: Partial<ThemeTokenSet>;
  /** Hide the store's first big banner while the campaign runs (the countdown banner takes its place). */
  hideFirstHero: boolean;
  sections: PresetSection[];
  /** Announcement bar messages (keys); "{countdown}" is passed in as a value. */
  announcement: string[];
  /** Pop-up: the look it borrows (a Marketing pop-up template), its words, and when it shows. */
  popup: { template: string; eyebrowKey: string; headlineKey: string; bodyKey: string; ctaKey: string; trigger: "exit_intent" | "delay" } | null;
  badge: (Pick<BadgeSettings, "appliesTo" | "autoPercent" | "position"> & { labelKey: string; background: string; textColor: string }) | null;
  countdown: Partial<CountdownSettings>;
  priority: number;
  endingSoonHours: number;
}

const key = (id: PresetId, name: string) => `preset.${id}.${name}`;

function preset(id: PresetId, input: Omit<CampaignPreset, "id" | "nameKey" | "descriptionKey">): CampaignPreset {
  return { id, nameKey: key(id, "name"), descriptionKey: key(id, "description"), ...input };
}

const HERO = (id: PresetId, extra: Record<string, unknown> = {}): PresetSection => ({
  kind: "campaign-countdown-hero",
  index: 0,
  copy: { eyebrow: key(id, "heroEyebrow"), title: key(id, "heroTitle"), body: key(id, "heroBody"), primaryCta: "section.shopNow" },
  settings: { timer: "campaign", height: "medium", ...extra },
});
const DEALS = (id: PresetId, index = 1): PresetSection => ({
  kind: "campaign-deal-grid",
  index,
  copy: { title: key(id, "dealsTitle"), cta: "section.seeAll" },
  settings: { source: "sale", limit: 8, showBadges: true },
});
const STRIP = (id: PresetId, index = 0): PresetSection => ({
  kind: "campaign-promo-strip",
  index,
  copy: { text: key(id, "stripText"), code: "" },
  settings: { useCampaignCode: true },
});
const GIFTS = (id: PresetId, index = 1): PresetSection => ({
  kind: "campaign-gift-guide",
  index,
  copy: { title: key(id, "giftsTitle") },
  settings: { source: "collections", limit: 4 },
});

const SALE_POPUP = (id: PresetId, template: string, trigger: "exit_intent" | "delay" = "exit_intent") => ({
  template,
  eyebrowKey: key(id, "popupEyebrow"),
  headlineKey: key(id, "popupHeadline"),
  bodyKey: key(id, "popupBody"),
  ctaKey: "popup.cta",
  trigger,
});

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  preset("black_friday", {
    swatch: ["#0A0A0A", "#FFD60A", "#FFFFFF"],
    tokens: { heroBg: "#0A0A0A", heroText: "#FFFFFF", accent: "#FFD60A", ctaBg: "#FFD60A", ctaText: "#0A0A0A" },
    hideFirstHero: true,
    sections: [HERO("black_friday", { tone: "dark" }), DEALS("black_friday")],
    announcement: [key("black_friday", "bar1"), key("black_friday", "bar2")],
    popup: SALE_POPUP("black_friday", "black_friday"),
    badge: { labelKey: key("black_friday", "badge"), background: "#0A0A0A", textColor: "#FFD60A", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 20,
    endingSoonHours: 24,
  }),
  preset("cyber_monday", {
    swatch: ["#120A2E", "#00E5FF", "#FF3D71"],
    tokens: { heroBg: "#120A2E", heroText: "#FFFFFF", accent: "#00E5FF", ctaBg: "#FF3D71", ctaText: "#FFFFFF" },
    hideFirstHero: false,
    sections: [STRIP("cyber_monday"), HERO("cyber_monday", { tone: "dark" })],
    announcement: [key("cyber_monday", "bar1")],
    popup: SALE_POPUP("cyber_monday", "flash_sale"),
    badge: { labelKey: key("cyber_monday", "badge"), background: "#120A2E", textColor: "#00E5FF", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "hms", style: "boxed", expiry: "hide" },
    priority: 25,
    endingSoonHours: 6,
  }),
  preset("christmas", {
    swatch: ["#0F5132", "#C62828", "#FFF4E0"],
    tokens: { heroBg: "#0F5132", heroText: "#FFF8EA", accent: "#C62828", ctaBg: "#C62828", ctaText: "#FFFFFF" },
    hideFirstHero: false,
    sections: [HERO("christmas"), GIFTS("christmas")],
    announcement: [key("christmas", "bar1"), key("christmas", "bar2")],
    popup: SALE_POPUP("christmas", "festive", "delay"),
    badge: { labelKey: key("christmas", "badge"), background: "#C62828", textColor: "#FFFFFF", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 10,
    endingSoonHours: 48,
  }),
  preset("detty_december", {
    swatch: ["#0B1F14", "#E8B53A", "#FFF7E6"],
    tokens: { heroBg: "#0B1F14", heroText: "#FFF7E6", accent: "#E8B53A", ctaBg: "#E8B53A", ctaText: "#0B1F14" },
    hideFirstHero: true,
    sections: [HERO("detty_december", { tone: "dark" }), DEALS("detty_december")],
    announcement: [key("detty_december", "bar1"), key("detty_december", "bar2")],
    popup: SALE_POPUP("detty_december", "detty_december"),
    badge: { labelKey: key("detty_december", "badge"), background: "#E8B53A", textColor: "#0B1F14", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 15,
    endingSoonHours: 48,
  }),
  preset("new_year", {
    swatch: ["#1B1B3A", "#F5C542", "#FFFFFF"],
    tokens: { heroBg: "#1B1B3A", heroText: "#FFFFFF", accent: "#F5C542", ctaBg: "#F5C542", ctaText: "#1B1B3A" },
    hideFirstHero: true,
    sections: [HERO("new_year", { tone: "dark" }), DEALS("new_year")],
    announcement: [key("new_year", "bar1")],
    popup: SALE_POPUP("new_year", "festive"),
    badge: { labelKey: key("new_year", "badge"), background: "#1B1B3A", textColor: "#F5C542", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 12,
    endingSoonHours: 24,
  }),
  preset("valentine", {
    swatch: ["#D6336C", "#FFF0F3", "#5A0B24"],
    tokens: { heroBg: "#5A0B24", heroText: "#FFF0F3", accent: "#F783AC", ctaBg: "#D6336C", ctaText: "#FFFFFF" },
    hideFirstHero: false,
    sections: [HERO("valentine"), GIFTS("valentine")],
    announcement: [key("valentine", "bar1")],
    popup: SALE_POPUP("valentine", "valentine", "delay"),
    badge: { labelKey: key("valentine", "badge"), background: "#D6336C", textColor: "#FFFFFF", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 10,
    endingSoonHours: 24,
  }),
  preset("easter", {
    swatch: ["#B8E0D2", "#F6E7A1", "#6B4F8A"],
    tokens: { heroBg: "#E9F5EF", heroText: "#2F2440", accent: "#6B4F8A", ctaBg: "#6B4F8A", ctaText: "#FFFFFF" },
    hideFirstHero: false,
    sections: [HERO("easter", { tone: "light" })],
    announcement: [key("easter", "bar1")],
    popup: SALE_POPUP("easter", "weekend_sale", "delay"),
    badge: { labelKey: key("easter", "badge"), background: "#6B4F8A", textColor: "#FFFFFF", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 10,
    endingSoonHours: 24,
  }),
  preset("ramadan_eid", {
    swatch: ["#123B2A", "#C9A24A", "#F6F1E4"],
    tokens: { heroBg: "#123B2A", heroText: "#F6F1E4", accent: "#C9A24A", ctaBg: "#C9A24A", ctaText: "#123B2A", headingStyle: "serif" },
    hideFirstHero: false,
    sections: [HERO("ramadan_eid", { tone: "dark" }), GIFTS("ramadan_eid")],
    announcement: [key("ramadan_eid", "bar1")],
    popup: SALE_POPUP("ramadan_eid", "sallah", "delay"),
    badge: { labelKey: key("ramadan_eid", "badge"), background: "#123B2A", textColor: "#C9A24A", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 10,
    endingSoonHours: 48,
  }),
  preset("back_to_school", {
    swatch: ["#FFD23F", "#3A86FF", "#1D1A16"],
    tokens: { heroBg: "#3A86FF", heroText: "#FFFFFF", accent: "#FFD23F", ctaBg: "#FFD23F", ctaText: "#1D1A16" },
    hideFirstHero: false,
    sections: [STRIP("back_to_school"), GIFTS("back_to_school")],
    announcement: [key("back_to_school", "bar1")],
    popup: null,
    badge: { labelKey: key("back_to_school", "badge"), background: "#FFD23F", textColor: "#1D1A16", appliesTo: "discounted", autoPercent: false, position: "top-left" },
    countdown: { target: "end", format: "words", style: "inline", expiry: "hide" },
    priority: 5,
    endingSoonHours: 72,
  }),
  preset("flash_sale", {
    swatch: ["#1A0B2E", "#FF3D71", "#FFD60A"],
    tokens: { heroBg: "#1A0B2E", heroText: "#FFFFFF", accent: "#FFD60A", ctaBg: "#FF3D71", ctaText: "#FFFFFF" },
    hideFirstHero: true,
    sections: [HERO("flash_sale", { tone: "dark" }), DEALS("flash_sale")],
    announcement: [key("flash_sale", "bar1")],
    popup: SALE_POPUP("flash_sale", "flash_sale"),
    badge: { labelKey: key("flash_sale", "badge"), background: "#FF3D71", textColor: "#FFFFFF", appliesTo: "discounted", autoPercent: true, position: "top-left" },
    countdown: { target: "end", format: "hms", style: "boxed", expiry: "hide" },
    priority: 30,
    endingSoonHours: 3,
  }),
  preset("blank", {
    swatch: ["#F4F1EA", "#0E2A38", "#73D8C8"],
    tokens: {},
    hideFirstHero: false,
    sections: [],
    announcement: [],
    popup: null,
    badge: null,
    countdown: { target: "end", format: "dhms", style: "boxed", expiry: "hide" },
    priority: 0,
    endingSoonHours: 24,
  }),
];

export function campaignPreset(id: string | null | undefined): CampaignPreset | null {
  return CAMPAIGN_PRESETS.find((entry) => entry.id === id) ?? null;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/**
 * Moveable feasts, updated yearly. Eid dates are estimates: the day is confirmed by the moon sighting, so sellers can
 * shift the dates in the editor. Months are 1-based.
 */
export const MOVABLE_DATES: Record<number, { easter: [number, number]; eidFitr: [number, number]; eidAdha: [number, number] }> = {
  2026: { easter: [4, 5], eidFitr: [3, 20], eidAdha: [5, 27] },
  2027: { easter: [3, 28], eidFitr: [3, 10], eidAdha: [5, 17] },
  2028: { easter: [4, 16], eidFitr: [2, 27], eidAdha: [5, 5] },
};

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month, 0));
  const back = (last.getUTCDay() - weekday + 7) % 7;
  return last.getUTCDate() - back;
}

type Window = { startsAt: number; endsAt: number };
type Wall = [number, number, number, number?, number?];

function windowFor(zone: string, start: Wall, end: Wall): Window {
  return { startsAt: zonedTime(zone, start[0], start[1], start[2], start[3] ?? 0, start[4] ?? 0), endsAt: zonedTime(zone, end[0], end[1], end[2], end[3] ?? 23, end[4] ?? 59) };
}

/** This year's (or a given year's) window for a preset, or null for presets without fixed dates. */
export function presetWindowForYear(id: PresetId, year: number, zone: string, now = Date.now()): Window | null {
  switch (id) {
    case "black_friday": {
      const friday = lastWeekdayOfMonth(year, 11, 5);
      return windowFor(zone, [year, 11, friday], [year, 11, friday + 2]);
    }
    case "cyber_monday": {
      const friday = lastWeekdayOfMonth(year, 11, 5);
      return windowFor(zone, [year, 11, friday + 3], [year, 11, friday + 3]);
    }
    case "christmas":
      return windowFor(zone, [year, 12, 1], [year, 12, 25]);
    case "detty_december":
      return windowFor(zone, [year, 12, 10], [year, 12, 31]);
    case "new_year":
      return windowFor(zone, [year, 12, 26], [year + 1, 1, 7]);
    case "valentine":
      return windowFor(zone, [year, 2, 1], [year, 2, 14]);
    case "back_to_school":
      return windowFor(zone, [year, 8, 15], [year, 9, 15]);
    case "easter": {
      const dates = MOVABLE_DATES[year];
      if (!dates) return null;
      const [month, day] = dates.easter;
      // From the Saturday a week before Easter to Easter Monday.
      return windowFor(zone, [year, month, day - 8], [year, month, day + 1]);
    }
    case "ramadan_eid": {
      const dates = MOVABLE_DATES[year];
      if (!dates) return null;
      const [month, day] = dates.eidFitr;
      // The last ten days of Ramadan through the Sallah holiday.
      return windowFor(zone, [year, month, day - 10], [year, month, day + 2]);
    }
    case "flash_sale": {
      // Starts at the next full hour and runs for 24 hours.
      const start = Math.ceil((now + 1) / 3_600_000) * 3_600_000;
      return { startsAt: start, endsAt: start + 24 * 3_600_000 };
    }
    default:
      return null;
  }
}

/** The next window that hasn't ended yet (this year's, else next year's). Null for Blank or unknown years. */
export function suggestedPresetDates(id: PresetId, zone: string, now = Date.now()): Window | null {
  const year = new Date(now).getUTCFullYear();
  for (const candidate of [year - 1, year, year + 1, year + 2]) {
    const window = presetWindowForYear(id, candidate, zone, now);
    if (window && window.endsAt > now) return window;
  }
  return null;
}

/** Every message key a preset uses (the i18n test checks they exist in all five languages). */
export function presetMessageKeys(entry: CampaignPreset): string[] {
  const keys = [entry.nameKey, entry.descriptionKey, ...entry.announcement];
  for (const section of entry.sections) keys.push(...Object.values(section.copy).filter(Boolean));
  if (entry.popup) keys.push(entry.popup.eyebrowKey, entry.popup.headlineKey, entry.popup.bodyKey, entry.popup.ctaKey);
  if (entry.badge) keys.push(entry.badge.labelKey);
  return [...new Set(keys)];
}

// ─── Building a campaign from a preset ────────────────────────────────────────

/** Big banners a preset's countdown banner can stand in for (the first one is hidden while the campaign runs). */
export const HERO_KINDS = ["hero-split", "split-hero", "video-hero", "parallax-banner", "hero", "hero-slider"];

/** The first big banner on the home page, by id (null when the home page has none). */
export function firstHeroSectionId(home: { sections?: Array<{ id: string; kind: string; visible?: boolean }> } | null | undefined): string | null {
  return home?.sections?.find((section) => HERO_KINDS.includes(section.kind) && section.visible !== false)?.id ?? null;
}

/**
 * The section changes a preset makes on the home page: its campaign sections, filled with words in the seller's
 * language (`translate`), and hiding the first banner when the preset replaces it.
 */
export function presetSectionOverrides(entry: CampaignPreset, translate: (key: string) => string, makeId: (n: number) => string, heroId: string | null): CampaignSectionOverride[] {
  const overrides: CampaignSectionOverride[] = [];
  if (entry.hideFirstHero && heroId) overrides.push({ id: makeId(0), page: "home", action: "hide", sectionId: heroId });
  entry.sections.forEach((spec, at) => {
    const sectionId = `cmp-${makeId(at + 1)}`;
    const section = newStoreBlockSection(spec.kind, sectionId);
    if (!section) return;
    const words: Record<string, unknown> = {};
    for (const [field, messageKey] of Object.entries(spec.copy)) words[field] = messageKey ? translate(messageKey) : "";
    section.blocks = section.blocks.map((block) => (block.type === "copy" ? { ...block, content: { ...block.content, ...words } } : block));
    section.settings = { ...(section.settings ?? {}), ...(spec.settings ?? {}) };
    overrides.push({ id: makeId(at + 1), page: "home", action: "add", section, position: { index: spec.index } });
  });
  return overrides;
}

/** The blocks a preset starts with (the pop-up block is made separately: it needs its store pop-up first). */
export function presetBlocks(entry: CampaignPreset, translate: (key: string, vars?: Record<string, string>) => string) {
  const blocks: Array<{ type: "announcement" | "badge" | "countdown"; settings: Record<string, unknown> }> = [];
  if (entry.announcement.length) {
    blocks.push({
      type: "announcement",
      settings: {
        messages: entry.announcement.map((messageKey) => ({ text: translate(messageKey, { countdown: "{countdown}" }), link: "", linkLabel: "" })),
        rotateSeconds: 5,
        dismissible: true,
        sticky: false,
        background: "",
        textColor: "",
      },
    });
  }
  if (entry.badge) {
    const { labelKey, ...badge } = entry.badge;
    blocks.push({ type: "badge", settings: { ...badge, label: translate(labelKey), collectionId: "", productIds: [], tag: "" } });
  }
  blocks.push({ type: "countdown", settings: { target: "end", customAt: null, format: "dhms", style: "boxed", expiry: "hide", expiredText: "", replaceText: "", replaceLink: "", display: "inline", label: "", ...entry.countdown } });
  return blocks;
}
