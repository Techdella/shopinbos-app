import type { BannerCopy, BannerVibe } from "@shared/store-banner";
import { rexApi } from "./rex-jobs";
import { api } from "./api";
import { appLocale } from "./app-locale";

// The phone's banner helpers in Edit my shop (components/seller/BannerEditor.tsx):
//   POST /api/mobile/banner            Rex writes banner words (3 choices) and makes a banner picture
//   POST /api/mobile/banner/taglines   Peggy writes 3 taglines
//   POST /api/ai/generate-logo         Rex's logo ideas (the same as sign-up's "Make me one" and the web Logo studio)
//   GET  /api/store/collections        the shop's collections, for "Button opens › A collection"
// Each costs AI credits as on the web (the day's allowance first). None of them saves anything: the seller picks and
// Edit my shop saves through the web builder's own routes (lib/shop-edit.ts).

export interface RexBanner {
  options: BannerCopy[];
  imageUrl: string | null;
  pictureProblem: string | null;
  creditsLeft: number | null;
}

/** A Rex job (lib/rex-jobs.ts): tapping again after losing signal gets the same banner without paying twice. */
export const buildBanner = (input: { prompt: string; vibe: BannerVibe | null; picture: boolean }) =>
  rexApi<RexBanner>("/api/mobile/banner", { ...input, prompt: input.prompt.trim(), language: appLocale() }, "banner");

export const writeTaglines = (current: string) =>
  api<{ taglines: string[] }>("/api/mobile/banner/taglines", { method: "POST", json: { current: current.trim(), language: appLocale() } });

export interface LogoIdea {
  style: string;
  label: string;
  url: string;
}

/** Three logo ideas; `round` > 1 asks for a fresh direction, `notes` says what to change. */
export async function drawShopLogos(input: { businessName: string; round: number; notes?: string }) {
  const body = await rexApi<{ logos?: LogoIdea[] }>("/api/ai/generate-logo", { businessName: input.businessName, round: input.round, notes: input.notes?.trim() || undefined }, "shop-logo");
  return body?.logos ?? [];
}

/** The logo the shop shows (the same field sign-up and Settings save). */
export const saveShopLogo = (logoUrl: string) => api<unknown>("/api/app/store", { method: "PATCH", json: { logoUrl } });

export interface ShopCollection {
  id: string;
  name: string;
}

export async function fetchCollections(): Promise<ShopCollection[]> {
  const rows = await api<Array<{ id: string; name: string }>>("/api/store/collections?limit=50").catch(() => []);
  return (rows ?? []).filter((row) => row.id && row.name).map((row) => ({ id: row.id, name: row.name }));
}
