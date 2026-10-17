import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { uploadFileServer } from "@/lib/supabase/storage.server";
import {
  analyseLogoPixels,
  isSvgLogo,
  hasDarkNeutralInk,
  knockOutForDark,
  readLogoVariantsRecord,
  relightDarkInk,
  recolourSvgForDark,
  type LogoAnalysis,
  type LogoVariantsRecord,
} from "@shared/logo-variants";

// Works out, once, how a store's logo should show on dark backgrounds, and saves it in brandSettings.logoVariants
// (shared/logo-variants.ts). Runs whenever the logo changes (Brand kit, Logo studio, Rex, the builder); it never
// blocks saving the logo: anything that fails just leaves the storefront's safe fallback (a light tile).

type Sharp = (typeof import("sharp"))["default"];

async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

const MAX_BYTES = 8 * 1024 * 1024;

async function download(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`logo fetch ${response.status}`);
  const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("logo too large");
  return { type, bytes };
}

function variantPath(userId: string, extension: string) {
  return `logos/${userId}/on-dark-${Date.now()}.${extension}`;
}

/** Measures the logo and, when it can, makes its dark-background version. */
export async function deriveLogoVariants(logoUrl: string, userId: string): Promise<LogoVariantsRecord> {
  const base: LogoVariantsRecord = { for: logoUrl, onDark: null, source: "auto", analysis: null };
  if (!isOwnImageUrl(logoUrl)) return base;
  const { type, bytes } = await download(logoUrl);

  if (isSvgLogo(logoUrl, type)) {
    const recoloured = recolourSvgForDark(bytes.toString("utf8"));
    const stored = await uploadFileServer("brand", new Blob([recoloured], { type: "image/svg+xml" }), variantPath(userId, "svg"));
    return { ...base, onDark: stored.publicUrl, analysis: { background: "transparent", backgroundColour: null, mono: false, ink: "dark", inkColour: null } };
  }

  const sharp = await loadSharp();
  if (!sharp) return base;
  const small = await sharp(bytes).ensureAlpha().resize(128, 128, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const analysis: LogoAnalysis = analyseLogoPixels(small.data, small.info.width, small.info.height);
  const result: LogoVariantsRecord = { ...base, analysis };

  // A one-colour dark mark on a flat background (most generated logos): cut the background out and ink it light.
  if (analysis.background === "plain" && analysis.mono && analysis.ink === "dark" && analysis.backgroundColour && analysis.inkColour) {
    const full = await sharp(bytes).ensureAlpha().resize(768, 768, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const pixels = knockOutForDark(full.data, analysis.backgroundColour, analysis.inkColour);
    const png = await sharp(Buffer.from(pixels.buffer), { raw: { width: full.info.width, height: full.info.height, channels: 4 } }).png().toBuffer();
    const stored = await uploadFileServer("brand", new Blob([new Uint8Array(png)], { type: "image/png" }), variantPath(userId, "png"));
    result.onDark = stored.publicUrl;
    return result;
  }

  // See-through, several colours, dark lettering (a black wordmark with a coloured accent, Rex's usual): the
  // lettering is re-inked light and the accents keep their colour. One-colour see-through marks need no file.
  if (analysis.background === "transparent" && !analysis.mono && hasDarkNeutralInk(small.data)) {
    const full = await sharp(bytes).ensureAlpha().resize(768, 768, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const pixels = relightDarkInk(full.data);
    const png = await sharp(Buffer.from(pixels.buffer), { raw: { width: full.info.width, height: full.info.height, channels: 4 } }).png().toBuffer();
    const stored = await uploadFileServer("brand", new Blob([new Uint8Array(png)], { type: "image/png" }), variantPath(userId, "png"));
    result.onDark = stored.publicUrl;
  }
  return result;
}

async function writeVariants(storeId: string, variants: LogoVariantsRecord | null) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  const settings = store?.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? { ...(store.brandSettings as Record<string, unknown>) } : {};
  if (variants) settings.logoVariants = variants;
  else delete settings.logoVariants;
  await db.store.update({ where: { id: storeId }, data: { brandSettings: settings as Prisma.InputJsonValue } });
}

/**
 * Call after Store.logoUrl changes. Keeps a seller's own dark logo only while it belongs to this logo; otherwise
 * measures the new logo. Never throws.
 */
export async function refreshLogoVariants(storeId: string, userId: string, logoUrl: string | null | undefined) {
  try {
    const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
    const saved = readLogoVariantsRecord(store?.brandSettings);
    if (!logoUrl) {
      if (saved) await writeVariants(storeId, null);
      return null;
    }
    if (saved && saved.for === logoUrl && (saved.source === "seller" || saved.analysis)) return saved;
    const variants = await deriveLogoVariants(logoUrl, userId).catch((error) => {
      console.warn("[logo-variants] couldn't measure the logo", error instanceof Error ? error.message : error);
      return { for: logoUrl, onDark: null, source: "auto", analysis: null } satisfies LogoVariantsRecord;
    });
    await writeVariants(storeId, variants);
    return variants;
  } catch (error) {
    console.warn("[logo-variants] refresh failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The seller's own logo for dark backgrounds (url), or null to go back to the automatic one. */
export async function setDarkLogo(storeId: string, userId: string, logoUrl: string | null, darkUrl: string | null) {
  if (!logoUrl) return null;
  if (darkUrl) {
    const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
    const saved = readLogoVariantsRecord(store?.brandSettings);
    const analysis = saved && saved.for === logoUrl ? saved.analysis : null;
    const variants: LogoVariantsRecord = { for: logoUrl, onDark: darkUrl, source: "seller", analysis };
    await writeVariants(storeId, variants);
    return variants;
  }
  await writeVariants(storeId, null);
  return refreshLogoVariants(storeId, userId, logoUrl);
}
