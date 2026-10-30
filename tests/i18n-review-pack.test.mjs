// The native-speaker review pack (docs/translations): the CSV round-trips exactly, and the import script applies
// corrections only when they keep the English placeholders, never touches English, and is a dry run by default.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { parseCsv, readReview, setMessage, importReview } = await import("../scripts/i18n-import-review.mjs");
const { csvCell, notesFor } = await import("../scripts/i18n-export-review.mjs");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CSV cells with commas, quotes and new lines round-trip", () => {
  const values = ["plain", "a, b", 'say "hi"', "line one\nline two", "Ẹ kú àbọ̀ · ₦12,500"];
  const line = values.map(csvCell).join(",");
  assert.deepEqual(parseCsv(`﻿a,b,c,d,e\r\n${line}\r\n`), [["a", "b", "c", "d", "e"], values]);
});

test("the review pack has the agreed columns and only real messages", () => {
  const rows = readReview(read("docs/translations/review-2026-10.csv"));
  assert.ok(rows.length > 1000, `rows: ${rows.length}`);
  assert.deepEqual(Object.keys(rows[0]), ["namespace", "key", "en", "pcm", "yo", "ha", "ig", "notes"]);
  // Every row is a real message (the values may move on after review; the import handles that).
  const missing = rows.filter((row) => typeof CATALOGS[row.namespace]?.en[row.key] !== "string").map((row) => `${row.namespace}/${row.key}`);
  assert.deepEqual(missing, []);
  for (const namespace of ["storeEditor", "m_rexBuild", "rexJobs", "together", "productVideos", "resell", "followers", "pilotNumbers", "shopLink", "details", "bundles"]) {
    assert.ok(rows.some((row) => row.namespace === namespace), namespace);
  }
  assert.match(notesFor({ key: "x", en: "Hi {name}, Rex has {count, plural, one {# order} other {# orders}}", isNew: true, fixed: false }), /new; keep \{name\}, \{count\} exactly; plural: # is the number; keep Rex as is/);
});

test("a catalog entry is replaced in place, quoted or bare key, value on the next line too", () => {
  const source = 'const yo = {\n  title: "Old",\n  "a.b": "Old \\"x\\"",\n  "long.one":\n    "Old long",\n};\n';
  assert.equal(setMessage(source, "title", "New"), source.replace('title: "Old"', 'title: "New"'));
  assert.match(setMessage(source, "a.b", 'Ẹ "kú"'), /"a\.b": "Ẹ \\"kú\\""/);
  assert.match(setMessage(source, "long.one", "New long"), /"long\.one":\n {4}"New long"/);
  assert.equal(setMessage(source, "missing", "x"), null);
});

test("import: dry run by default, English never imported, placeholders checked, changed English skipped", async () => {
  const english = CATALOGS.shopLink.en["link.opens"];
  const yo = CATALOGS.shopLink.yo["link.opens"];
  const csv = [
    "namespace,key,en,pcm,yo,ha,ig,notes",
    // A good correction (yo), an empty cell (no change), a broken placeholder (ig).
    `shopLink,link.opens,${csvCell(english)},,${csvCell(`${yo} ✓`)},,${csvCell("Ọ na-emeghe ụlọ ahịa gị: {link}")},`,
    // English edited in the sheet: never imported, and the row is skipped.
    `shopLink,copy,Copy this,,Daakọ rẹ̀,,,`,
    `nope,key,x,,,,,`,
  ].join("\n");
  const lines = [];
  const report = await importReview({ csv, log: (line) => lines.push(line) });
  assert.deepEqual(report.changed.map((change) => change.where), ["shopLink/yo/link.opens"]);
  assert.equal(report.refused.length, 1);
  assert.match(report.refused[0], /shopLink\/ig\/link\.opens: placeholders must be \{url\}/);
  assert.deepEqual(report.skipped.map((line) => line.split(":")[0]), ["shopLink/copy", "nope/key"]);
  assert.match(lines.join("\n"), /dry run: add --apply to write them/);
  // Nothing was written.
  assert.equal(read("shared/i18n/messages/shopLink/yo.ts").includes(`${yo} ✓`), false);
});

test("the README tells reviewers how to mark corrections and how to bring them back", () => {
  const readme = read("docs/translations/README.md");
  assert.match(readme, /not a substitute for\s+native speakers/i);
  assert.match(readme, /node scripts\/i18n-import-review\.mjs docs\/translations\/review-2026-10\.csv --apply/);
  assert.match(readme, /\{name\}/);
});
