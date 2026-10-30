#!/usr/bin/env node
// Brings a native speaker's corrected review CSV (docs/translations/review-*.csv: namespace,key,en,pcm,yo,ha,ig,notes)
// back into the catalogs (shared/i18n/messages/<namespace>/<locale>.ts). See docs/translations/README.md.
//
//   node scripts/i18n-import-review.mjs docs/translations/review-2026-10.csv            dry run: shows what would change
//   node scripts/i18n-import-review.mjs docs/translations/review-2026-10.csv --apply    writes the catalogs
//   … --langs=yo,ig      only these languages (e.g. one reviewer's columns)
//
// Rules:
//   * English is the source and is never imported. A row whose English differs from the catalog's now (the message
//     changed after the export) is skipped with a warning: review it again on the new English.
//   * An empty cell means "no change". Only a cell that differs from the catalog is a correction.
//   * A correction must keep exactly the English placeholders ({name}, {count, plural, …}) and balanced braces;
//     otherwise it is refused and listed (fix the cell and run again).
//   * Unknown namespaces, keys or languages are reported, never created.
// After --apply: run `npm test` (tests/i18n*.test.mjs check every language again).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["pcm", "yo", "ha", "ig"];

/** RFC 4180 CSV (quoted cells, "" for a quote, newlines inside quotes); a leading byte-order mark is ignored. */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value !== ""));
}

/** Rows as objects keyed by the header. */
export function readReview(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((name) => name.trim().toLowerCase());
  for (const need of ["namespace", "key", "en"]) if (!names.includes(need)) throw new Error(`The CSV has no "${need}" column.`);
  return rows.map((cells) => Object.fromEntries(names.map((name, index) => [name, cells[index] ?? ""])));
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The catalog file's text with `key` set to `value` (quoted or bare key, value on the same or the next line). */
export function setMessage(source, key, value) {
  const keyPattern = /^[A-Za-z_$][\w$]*$/.test(key) ? `(?:"${escapeRe(key)}"|${escapeRe(key)})` : `"${escapeRe(key)}"`;
  const pattern = new RegExp(`(\\n[ \\t]*${keyPattern}[ \\t]*:\\s*)"(?:[^"\\\\\\n]|\\\\.)*"`);
  if (!pattern.test(source)) return null;
  return source.replace(pattern, (_match, head) => `${head}${JSON.stringify(value)}`);
}

export async function importReview({ csv, apply = false, langs = LANGS, log = console.log }) {
  const { placeholdersOf } = await import(pathToFileURL(join(root, "shared/i18n/index.ts")).href);
  const rows = readReview(csv);
  const files = new Map();
  const catalogs = new Map();
  const report = { changed: [], refused: [], skipped: [] };

  for (const row of rows) {
    const namespace = row.namespace.trim();
    const key = row.key.trim();
    const dir = join(root, "shared/i18n/messages", namespace);
    if (!namespace || !key || !existsSync(join(dir, "en.ts"))) {
      report.skipped.push(`${namespace}/${key}: unknown namespace`);
      continue;
    }
    if (!catalogs.has(namespace)) catalogs.set(namespace, (await import(pathToFileURL(join(dir, "index.ts")).href)).default);
    const catalog = catalogs.get(namespace);
    const english = catalog.en[key];
    if (typeof english !== "string") {
      report.skipped.push(`${namespace}/${key}: no such key in English`);
      continue;
    }
    if (row.en !== english) {
      report.skipped.push(`${namespace}/${key}: the English changed since the export, review it again`);
      continue;
    }
    for (const locale of langs) {
      const proposed = row[locale];
      if (proposed === undefined || proposed.trim() === "") continue;
      const now = catalog[locale]?.[key];
      if (proposed === now) continue;
      const opens = (proposed.match(/\{/g) ?? []).length;
      const closes = (proposed.match(/\}/g) ?? []).length;
      if (opens !== closes || JSON.stringify(placeholdersOf(proposed)) !== JSON.stringify(placeholdersOf(english))) {
        report.refused.push(`${namespace}/${locale}/${key}: placeholders must be {${placeholdersOf(english).join("}, {")}} like the English (got "${proposed}")`);
        continue;
      }
      const file = join(dir, `${locale}.ts`);
      const source = files.get(file) ?? readFileSync(file, "utf8");
      const next = setMessage(source, key, proposed);
      if (next === null) {
        report.refused.push(`${namespace}/${locale}/${key}: not found in ${locale}.ts (add it there first)`);
        continue;
      }
      files.set(file, next);
      report.changed.push({ where: `${namespace}/${locale}/${key}`, from: now ?? "", to: proposed });
    }
  }

  for (const change of report.changed) log(`${apply ? "set" : "would set"} ${change.where}\n    - ${change.from}\n    + ${change.to}`);
  for (const line of report.refused) log(`REFUSED ${line}`);
  for (const line of report.skipped) log(`skipped ${line}`);
  if (apply) for (const [file, text] of files) writeFileSync(file, text, "utf8");
  log(`\n${report.changed.length} correction(s) ${apply ? "written" : "found (dry run: add --apply to write them)"}; ${report.refused.length} refused; ${report.skipped.length} skipped.`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const path = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!path) {
    console.error("Usage: node scripts/i18n-import-review.mjs <review.csv> [--apply] [--langs=pcm,yo,ha,ig]");
    process.exit(1);
  }
  const langsArg = process.argv.find((arg) => arg.startsWith("--langs="));
  const langs = langsArg ? langsArg.slice("--langs=".length).split(",").map((lang) => lang.trim()).filter((lang) => LANGS.includes(lang)) : LANGS;
  const report = await importReview({ csv: readFileSync(path, "utf8"), apply: process.argv.includes("--apply"), langs });
  process.exitCode = report.refused.length ? 1 : 0;
}
