"use client";

import type { StoreEditorSnapshot } from "@/lib/store-templates";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";
import type { StudioChange } from "./types";
import type { RexCard } from "@/lib/ai/rex/cards";
import type { Inspiration, InspirationLink } from "@/lib/ai/rex/inspiration";
import type { BuildPlan } from "@/lib/ai/rex/build-plan";

// Browser calls for Rex Studio. They rely on the Supabase session cookie.

async function readError(response: Response, fallback: string) {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return response.status === 401 ? "Your session has ended. Log in again to carry on." : fallback;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

const json = (payload: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

export async function askRexStudio(input: { message: string; history: Array<{ role: "user" | "assistant"; content: string }>; imageUrls: string[] }): Promise<StudioChange> {
  const response = await fetch("/api/ai/build-store/studio", json(input));
  if (!response.ok) throw new Error(await readError(response, "Rex couldn't make that change. Nothing was changed; try again."));
  return ((await response.json()) as { data: StudioChange }).data;
}

/** "Build my store": the full Rex build (design, pages, sample products, images), saved as a draft version. */
export async function buildWholeStore(input: {
  request: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  brief?: string;
  brandContext: Record<string, unknown>;
  templateContext?: { templateId: string; templateName: string } | null;
  inspiration?: Inspiration | null;
  /** False for the full build (its photo step makes the pictures) and the quick build. */
  generateImages?: boolean;
}) {
  const response = await fetch(
    "/api/ai/build-store",
    json({
      messages: [...input.history, { role: "user", content: input.request }].slice(-30),
      brief: input.brief,
      brandContext: input.brandContext,
      templateContext: input.templateContext ?? undefined,
      versionLabel: input.request,
      inspiration: input.inspiration ?? undefined,
      generateImages: input.generateImages,
    }),
  );
  if (!response.ok) throw new Error(await readError(response, "Rex couldn't build the store. Nothing was published; try again."));
  const { data } = (await response.json()) as {
    data: {
      draft: StoreEditorSnapshot;
      notes: string[];
      products: Array<{ name: string }>;
      pages: Array<{ title: string }>;
      images: { hero: string | null; product: string | null };
      version?: { id: string; n: number };
      undoTo?: string | null;
      versions?: RexVersionSummary[];
      themeId?: string | null;
    };
  };
  return data;
}

export interface BuildPlans {
  full: BuildPlan;
  quick: BuildPlan;
  balance: number;
  costs: { build: number; text: number; image: number };
  imagesOn: boolean;
}

/** What a full and a quick build would do with today's allowance and the seller's credits. */
export async function getBuildPlans(): Promise<BuildPlans> {
  const response = await fetch("/api/ai/build-store/plan", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Couldn't check your AI credits."));
  return ((await response.json()) as { data: BuildPlans }).data;
}

/** Reads a store page the seller likes (Rex's inspiration). */
export async function readInspiration(url: string): Promise<InspirationLink> {
  const response = await fetch("/api/ai/build-store/inspiration", json({ url }));
  if (!response.ok) throw new Error(await readError(response, "Rex couldn't read that page. Add a screenshot of it instead."));
  return ((await response.json()) as { data: InspirationLink }).data;
}

/** Full build, step two: every page's words and search titles. */
export async function writeEveryPage(inspiration: Inspiration | null): Promise<StudioChange> {
  const response = await fetch("/api/ai/build-store/pages", json({ inspiration }));
  if (!response.ok) throw new Error(await readError(response, "Rex couldn't write the pages. Your store design is saved."));
  return ((await response.json()) as { data: StudioChange }).data;
}

/** Full build, last step: banner, story and sample-product photos. */
export async function makeBuildPhotos(maxPhotos: number) {
  const response = await fetch("/api/ai/build-store/photos", json({ maxPhotos }));
  if (!response.ok) throw new Error(await readError(response, "Rex couldn't make the photos. Your store is saved."));
  return ((await response.json()) as { data: { made: number; skipped: number; changes: string[]; notes: string[]; edit: StudioChange | null } }).data;
}

export async function restoreVersion(id: string) {
  const response = await fetch("/api/ai/build-store/versions", json({ action: "restore", id }));
  if (!response.ok) throw new Error(await readError(response, "Couldn't restore that version."));
  return ((await response.json()) as { data: { draft: StoreEditorSnapshot; restored: { id: string; n: number }; versions: RexVersionSummary[] } }).data;
}

export type PublishResult =
  | { ok: true }
  | { ok: false; message: string; blockers: string[] };

/** Same publish path as the advanced builder. */
export async function publishDraft(): Promise<PublishResult> {
  const response = await fetch("/api/store/editor/publish", { method: "POST" });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; blockers?: string[] } } | null;
  if (!response.ok) return { ok: false, message: body?.error?.message ?? "Couldn't publish. Try again.", blockers: body?.error?.blockers ?? [] };
  return { ok: true };
}

/** Uploads a photo to the store's media and returns its public URL. */
export async function uploadStudioPhoto(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("folder", "store-banners");
  const response = await fetch("/api/upload", { method: "POST", body });
  const result = (await response.json().catch(() => null)) as { data?: { publicUrl?: string }; error?: { message?: string } } | null;
  if (!response.ok || !result?.data?.publicUrl) throw new Error(result?.error?.message ?? "That photo didn't upload. Try another one.");
  return result.data.publicUrl;
}

export interface RexAgentReply {
  text: string;
  cards: RexCard[];
  draft: StoreEditorSnapshot | null;
  versions: RexVersionSummary[] | null;
  creditsNeeded?: boolean;
}

/** An error from the Rex API with its code (AI_CREDITS_NEEDED when the allowance and credits are used up). */
export class RexApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** One turn with Rex's agent (tools: pictures, logos, videos, store edits, copy, marketing). */
export async function askRex(input: { messages: Array<{ role: "user" | "assistant"; content: string }>; imageUrls: string[] }): Promise<RexAgentReply> {
  const response = await fetch("/api/ai/rex", json(input));
  if (!response.ok) {
    const code = response.status === 402 ? ((await response.clone().json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code : undefined;
    throw new RexApiError(await readError(response, "Rex couldn't answer just now. Nothing was changed; try again."), code);
  }
  return ((await response.json()) as { data: RexAgentReply }).data;
}

export type RexCardAction =
  | { action: "save_product_image"; productId: string; imageUrl: string; mode: "add" | "main" | "replace"; replaceIndex: number | null }
  | { action: "set_logo"; imageUrl: string }
  | { action: "apply_product_copy"; productId: string; description: string }
  | { action: "activate_automation"; id: string }
  | { action: "save_to_media"; url: string; kind: "image" | "video"; name: string | null }
  | { action: "set_brand_asset"; kind: "icon" | "favicon"; url: string };

/** The seller's products, for "Add to a product" on a picture made without one. */
export async function rexProductChoices(): Promise<Array<{ id: string; name: string; image: string | null }>> {
  const response = await fetch("/api/ai/rex/actions");
  if (!response.ok) throw new Error(await readError(response, "Couldn't load your products."));
  return ((await response.json()) as { data: { products: Array<{ id: string; name: string; image: string | null }> } }).data.products;
}

/** A tap on one of Rex's cards: the seller's confirmation. */
export async function rexCardAction(payload: RexCardAction): Promise<{ message: string; href?: string }> {
  const response = await fetch("/api/ai/rex/actions", json(payload));
  if (!response.ok) throw new Error(await readError(response, "That didn't save. Try again."));
  return ((await response.json()) as { data: { message: string; href?: string } }).data;
}
