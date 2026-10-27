#!/usr/bin/env node
// Points the imported HTML store templates (public/store-templates) at the app's Google Fonts proxy
// (/api/fonts/google/…, src/lib/google-fonts-proxy.ts) instead of fonts.googleapis.com, so a visitor's browser never
// calls Google. Safe to run again: already rewritten files don't change. Run after adding a template:
//   node scripts/self-host-template-fonts.mjs [--check]   (--check: exit 1 if any file still calls Google)

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { selfHostGoogleFonts } = await import("../src/lib/google-fonts-proxy.ts");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "store-templates");
const CHECK = process.argv.includes("--check");
const TEXT = /\.(html?|css|scss|less)$/i;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === ".sass-cache" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (TEXT.test(name)) yield path;
  }
}

let changed = 0;
let left = 0;
for (const path of files(ROOT)) {
  const before = readFileSync(path, "utf8");
  if (!/fonts\.(googleapis|gstatic)\.com/.test(before)) continue;
  const after = selfHostGoogleFonts(before);
  if (/fonts\.(googleapis|gstatic)\.com/.test(after)) {
    left += 1;
    console.warn(`still calls Google: ${path}`);
  }
  if (after !== before && !CHECK) {
    writeFileSync(path, after);
    changed += 1;
  }
}
console.log(CHECK ? `${left} file(s) still call Google Fonts` : `rewrote ${changed} file(s); ${left} still call Google Fonts`);
if (CHECK && left) process.exit(1);
