#!/usr/bin/env node
// One-off: works out the dark-background logo (brandSettings.logoVariants) for every store that has a logo but no
// record yet, so dark headers and footers stop falling back to the light tile. Same steps as
// src/lib/logo-variants.server.ts (deriveLogoVariants), through Supabase's REST and storage APIs so it runs
// outside the app. Safe to run again: stores that already have a record for their current logo are skipped.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backfill-logo-variants.mjs [--dry-run]
//
// Optional: NEXT_PUBLIC_STORAGE_BUCKET (default shopinbos-media), --store <id> to do one store.

import sharp from "sharp";

const logo = await import("../shared/logo-variants.ts");

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || "shopinbos-media";
const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.includes("--store") ? process.argv[process.argv.indexOf("--store") + 1] : null;
const MAX_BYTES = 8 * 1024 * 1024;

if (!SUPABASE || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const supabaseHost = new URL(SUPABASE).host;

function isOwnImageUrl(url) {
  try {
    const target = new URL(url);
    return target.protocol === "https:" && target.host === supabaseHost && target.pathname.startsWith("/storage/v1/");
  } catch {
    return false;
  }
}

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE}/rest/v1/${path}`, { ...init, headers: { ...headers, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function upload(path, body, type) {
  const response = await fetch(`${SUPABASE}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...headers, "Content-Type": type, "x-upsert": "false" }, body });
  if (!response.ok) throw new Error(`upload ${path}: ${response.status} ${await response.text()}`);
  return `${SUPABASE}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`logo fetch ${response.status}`);
  const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("logo too large");
  return { type, bytes };
}

const variantPath = (userId, extension) => `logos/${userId}/on-dark-${Date.now()}.${extension}`;

/** deriveLogoVariants, step for step. */
async function derive(logoUrl, userId) {
  const base = { for: logoUrl, onDark: null, source: "auto", analysis: null };
  if (!isOwnImageUrl(logoUrl)) return { record: base, note: "not our storage: light tile" };
  const { type, bytes } = await download(logoUrl);

  if (logo.isSvgLogo(logoUrl, type)) {
    const recoloured = logo.recolourSvgForDark(bytes.toString("utf8"));
    const onDark = DRY ? "(dry run)" : await upload(variantPath(userId, "svg"), recoloured, "image/svg+xml");
    return { record: { ...base, onDark, analysis: { background: "transparent", backgroundColour: null, mono: false, ink: "dark", inkColour: null } }, note: "SVG recoloured" };
  }

  const small = await sharp(bytes).ensureAlpha().resize(128, 128, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const analysis = logo.analyseLogoPixels(small.data, small.info.width, small.info.height);
  const record = { ...base, analysis };
  if (analysis.background === "plain" && analysis.mono && analysis.ink === "dark" && analysis.backgroundColour && analysis.inkColour) {
    const full = await sharp(bytes).ensureAlpha().resize(768, 768, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const pixels = logo.knockOutForDark(full.data, analysis.backgroundColour, analysis.inkColour);
    const png = await sharp(Buffer.from(pixels.buffer), { raw: { width: full.info.width, height: full.info.height, channels: 4 } }).png().toBuffer();
    record.onDark = DRY ? "(dry run)" : await upload(variantPath(userId, "png"), png, "image/png");
    return { record, note: "background cut out, mark inked light" };
  }
  if (analysis.background === "transparent" && !analysis.mono && logo.hasDarkNeutralInk(small.data)) {
    const full = await sharp(bytes).ensureAlpha().resize(768, 768, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const pixels = logo.relightDarkInk(full.data);
    const png = await sharp(Buffer.from(pixels.buffer), { raw: { width: full.info.width, height: full.info.height, channels: 4 } }).png().toBuffer();
    record.onDark = DRY ? "(dry run)" : await upload(variantPath(userId, "png"), png, "image/png");
    return { record, note: "dark lettering inked light, coloured accents kept" };
  }
  const why = analysis.background === "transparent" && analysis.mono ? "transparent one-colour mark: lightened on the page" : `${analysis.background} background${analysis.mono ? "" : ", several colours"}: light tile`;
  return { record, note: why };
}

const filter = ONLY ? `&id=eq.${encodeURIComponent(ONLY)}` : "";
const stores = await rest(`Store?select=id,userId,name,logoUrl,brandSettings&logoUrl=not.is.null${filter}`);
let done = 0;
let skipped = 0;
let failed = 0;

for (const store of stores) {
  if (!store.logoUrl) continue;
  const saved = logo.readLogoVariantsRecord(store.brandSettings);
  if (saved && saved.for === store.logoUrl && (saved.source === "seller" || saved.analysis)) {
    skipped++;
    continue;
  }
  try {
    const { record, note } = await derive(store.logoUrl, store.userId);
    console.log(`${store.name} (${store.id}): ${note}${record.onDark ? ` → ${record.onDark}` : ""}`);
    if (!DRY) {
      // Re-read just before writing so a save made while this ran isn't overwritten.
      const [fresh] = await rest(`Store?select=logoUrl,brandSettings&id=eq.${store.id}`);
      if (fresh?.logoUrl !== store.logoUrl) {
        console.log("  logo changed meanwhile, skipped");
        skipped++;
        continue;
      }
      const settings = fresh.brandSettings && typeof fresh.brandSettings === "object" && !Array.isArray(fresh.brandSettings) ? fresh.brandSettings : {};
      await rest(`Store?id=eq.${store.id}`, { method: "PATCH", body: JSON.stringify({ brandSettings: { ...settings, logoVariants: record } }), headers: { Prefer: "return=minimal" } });
    }
    done++;
  } catch (error) {
    failed++;
    console.error(`${store.name} (${store.id}): failed: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`${DRY ? "[dry run] " : ""}${done} updated, ${skipped} already done, ${failed} failed.`);
process.exit(failed ? 1 : 0);
