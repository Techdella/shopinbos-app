#!/usr/bin/env node
// The review pack for native speakers: every message added or changed since a commit, in all five languages, as a
// CSV (namespace,key,en,pcm,yo,ha,ig,notes). See docs/translations/README.md.
//
//   node scripts/i18n-export-review.mjs <base-commit> docs/translations/review-2026-10.csv [--fixed=<file.json>]
//
// <base-commit>: the catalogs as they were before the period (e.g. `git rev-list -1 --before="3 days ago" HEAD`).
// --fixed: a JSON list of "namespace/key" the quality pass changed by hand, so the notes say so.
// Only reads the catalogs (git archive of the base into a temp folder); writes the one CSV.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "pcm", "yo", "ha", "ig"];
const BRANDS = ["Rex", "Peggy", "Shopinbos", "WhatsApp"];

export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function loadNamespace(dir, namespace) {
  const out = {};
  for (const locale of LOCALES) {
    const file = join(dir, namespace, `${locale}.ts`);
    out[locale] = existsSync(file) ? (await import(pathToFileURL(file).href)).default : {};
  }
  return out;
}

/** What a reviewer should know about a message (placeholders, plurals, names to keep, button length). */
export function notesFor({ key, en, isNew, fixed }) {
  const notes = [];
  notes.push(isNew ? "new" : "changed");
  if (fixed) notes.push("edited in the 2026-10 quality pass: please check");
  const names = [...new Set([...en.matchAll(/\{\s*(\w+)/g)].map((match) => match[1]))];
  if (names.length) notes.push(`keep {${names.join("}, {")}} exactly`);
  if (/plural/.test(en)) notes.push("plural: # is the number");
  const brands = BRANDS.filter((brand) => en.includes(brand));
  if (brands.length) notes.push(`keep ${brands.join(", ")} as is`);
  if (/₦/.test(en)) notes.push("keep ₦ amounts");
  if (en.length <= 22 && !/[.?!:]$/.test(en)) notes.push("short label or button: keep it short");
  if (/placeholder$/i.test(key)) notes.push("example text in an empty box");
  return notes.join("; ");
}

export async function exportReview({ base, out, fixed = [] }) {
  const temp = mkdtempSync(join(tmpdir(), "i18n-review-"));
  try {
    const archive = execFileSync("git", ["archive", base, "shared/i18n/messages"], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", temp], { input: archive });
    const before = join(temp, "shared/i18n/messages");
    const now = join(root, "shared/i18n/messages");
    const fixedSet = new Set(fixed);
    const lines = [["namespace", "key", ...LOCALES, "notes"].join(",")];
    let rows = 0;
    for (const namespace of readdirSync(now).sort()) {
      if (!existsSync(join(now, namespace, "en.ts"))) continue;
      const current = await loadNamespace(now, namespace);
      const old = existsSync(join(before, namespace, "en.ts")) ? await loadNamespace(before, namespace) : null;
      for (const [key, en] of Object.entries(current.en)) {
        const changed = !old || LOCALES.some((locale) => (old[locale]?.[key] ?? null) !== (current[locale]?.[key] ?? null));
        if (!changed) continue;
        const isNew = !old || !(key in old.en);
        lines.push([namespace, key, ...LOCALES.map((locale) => current[locale]?.[key] ?? ""), notesFor({ key, en, isNew, fixed: fixedSet.has(`${namespace}/${key}`) })].map(csvCell).join(","));
        rows += 1;
      }
    }
    // A byte-order mark so Excel and LibreOffice open the Yorùbá, Hausa and Igbo letters as UTF-8.
    writeFileSync(out, `﻿${lines.join("\r\n")}\r\n`, "utf8");
    return rows;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [base, out] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const fixedArg = process.argv.find((arg) => arg.startsWith("--fixed="));
  if (!base || !out) {
    console.error("Usage: node scripts/i18n-export-review.mjs <base-commit> <out.csv> [--fixed=<file.json>]");
    process.exit(1);
  }
  const fixed = fixedArg ? JSON.parse(readFileSync(fixedArg.slice("--fixed=".length), "utf8")) : [];
  const rows = await exportReview({ base, out, fixed });
  console.log(`Wrote ${rows} messages to ${out}`);
}
