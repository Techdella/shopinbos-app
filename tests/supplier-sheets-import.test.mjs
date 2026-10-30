// Supplier bulk upload from a CSV file or a Google Sheet (src/app/actions/supplier.ts), with a template, and a way
// in from the phone (it opens the web page).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { sheetsCsvUrl } = await import("../shared/sheets-link.ts");

test("a Google Sheets link becomes its CSV export, keeping the tab; anything else is refused", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  assert.equal(sheetsCsvUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`), `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`);
  assert.equal(sheetsCsvUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=12345`), `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=12345`);
  for (const bad of ["", "https://evil.example/spreadsheets/d/x", "http://docs.google.com/spreadsheets/d/" + id, "https://docs.google.com/document/d/" + id]) assert.equal(sheetsCsvUrl(bad), null, bad);
});

test("the sheet is read like a CSV, safely; the page has a template; the phone links to it", () => {
  const actions = read("src/app/actions/supplier.ts");
  assert.match(actions, /export async function importSupplierProductsSheet/);
  assert.match(actions, /safeFetch\(url, \{ httpsOnly: true/);
  assert.match(actions, /return importSupplierProductsCsv\(text\);/);
  const form = read("src/app/supplier/products/import/SupplierImportForm.tsx");
  assert.match(form, /download="shopinbos-products-template\.csv"/);
  assert.match(form, /importSupplierProductsSheet\(sheet\)/);
  assert.match(read("apps/mobile/src/app/supplier/(tabs)/products.tsx"), /openWeb\("\/supplier\/products\/import"\)/);
});
