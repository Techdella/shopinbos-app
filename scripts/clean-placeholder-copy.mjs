#!/usr/bin/env node
// One-off: blanks builder guidance that older templates saved into stores' page text ("Add your shipping or payment
// message here.", "<Store> is getting ready. Add your logo, …"), in each store's editor snapshots
// (brandSettings.editor draft and published) and its StorePage rows (content, draftContent, publishedContent).
// The list of that copy lives in shared/placeholder-copy.ts; the live store already hides it at render time, this
// makes the saved data match. Empty fields fall back to the store's settings (announcement) or description (footer).
// Safe to run again: stores with nothing left to clean are skipped.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/clean-placeholder-copy.mjs [--dry-run] [--store <id>]

const placeholder = await import("../shared/placeholder-copy.ts");

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.includes("--store") ? process.argv[process.argv.indexOf("--store") + 1] : null;
const PAGE = 200;

if (!SUPABASE || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (process.argv.includes("--store") && !ONLY) {
  console.error("--store needs a store id.");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE}/rest/v1/${path}`, { ...init, headers: { ...headers, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function all(path) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await rest(`${path}&order=id.asc&limit=${PAGE}&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** Every placeholder string in `value`, for the dry-run report. */
function found(value, storeName, out = new Set()) {
  if (typeof value === "string") {
    if (placeholder.isPlaceholderCopy(value, storeName)) out.add(value.trim());
  } else if (Array.isArray(value)) {
    for (const entry of value) found(entry, storeName, out);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) found(entry, storeName, out);
  }
  return out;
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** brandSettings with the editor snapshots cleaned, or null when nothing changed. */
function cleanSettings(settings, storeName) {
  if (!isObject(settings) || !isObject(settings.editor)) return null;
  const editor = placeholder.blankPlaceholderCopy(settings.editor, storeName);
  return editor ? { ...settings, editor } : null;
}

const storeFilter = ONLY ? `&id=eq.${encodeURIComponent(ONLY)}` : "";
const stores = await all(`Store?select=id,name,brandSettings${storeFilter}`);
let storesChanged = 0;
let pagesChanged = 0;
let failed = 0;

for (const store of stores) {
  try {
    const notes = [];
    const settings = cleanSettings(store.brandSettings, store.name);
    if (settings) {
      notes.push(`  editor: ${[...found(store.brandSettings.editor, store.name)].map((text) => JSON.stringify(text)).join(", ")}`);
      if (!DRY) {
        // Re-read just before writing and clean that copy, so a save made while this ran isn't overwritten.
        const [fresh] = await rest(`Store?select=name,brandSettings&id=eq.${store.id}`);
        const next = fresh ? cleanSettings(fresh.brandSettings, fresh.name) : null;
        if (next) await rest(`Store?id=eq.${store.id}`, { method: "PATCH", body: JSON.stringify({ brandSettings: next }), headers: { Prefer: "return=minimal" } });
      }
    }

    const pages = await all(`StorePage?select=id,slug,content,draftContent,publishedContent&storeId=eq.${encodeURIComponent(store.id)}`);
    let storePages = 0;
    for (const page of pages) {
      const patch = {};
      for (const key of ["content", "draftContent", "publishedContent"]) {
        const cleaned = page[key] ? placeholder.blankPlaceholderCopy(page[key], store.name) : null;
        if (cleaned) patch[key] = cleaned;
      }
      if (!Object.keys(patch).length) continue;
      notes.push(`  page /${page.slug}: ${[...found([page.content, page.draftContent, page.publishedContent], store.name)].map((text) => JSON.stringify(text)).join(", ")}`);
      storePages++;
      if (!DRY) {
        const [fresh] = await rest(`StorePage?select=content,draftContent,publishedContent&id=eq.${page.id}`);
        const next = {};
        for (const key of ["content", "draftContent", "publishedContent"]) {
          const cleaned = fresh?.[key] ? placeholder.blankPlaceholderCopy(fresh[key], store.name) : null;
          if (cleaned) next[key] = cleaned;
        }
        if (Object.keys(next).length) await rest(`StorePage?id=eq.${page.id}`, { method: "PATCH", body: JSON.stringify(next), headers: { Prefer: "return=minimal" } });
      }
    }

    if (!notes.length) continue;
    storesChanged++;
    pagesChanged += storePages;
    console.log(`${store.name} (${store.id})${DRY ? " [dry run]" : ""}`);
    for (const note of notes) console.log(note);
  } catch (error) {
    failed++;
    console.error(`${store.name} (${store.id}): ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\n${DRY ? "Would clean" : "Cleaned"} ${storesChanged} store${storesChanged === 1 ? "" : "s"} (${pagesChanged} page row${pagesChanged === 1 ? "" : "s"}) of ${stores.length} checked${failed ? `, ${failed} failed` : ""}.`);
if (failed) process.exitCode = 1;
