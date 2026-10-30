// "Find partners" (src/lib/delivery-market/manage.server.ts findPartners), used by the seller web page and the phone
// app: partners from the one-question sign-up have no public rate card and no pickup areas yet, and must still show.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { partnerMatchesShop } = await import("../shared/delivery-market.ts");
const source = readFileSync(new URL("../src/lib/delivery-market/manage.server.ts", import.meta.url), "utf8");
const find = source.slice(source.indexOf("export async function findPartners"), source.indexOf("export async function partnerDetail"));

test("partners without a public rate card still show (a starting price or 'ask for a quote')", () => {
  assert.doesNotMatch(find, /startingPrice !== null/);
  assert.match(find, /\.filter\(\(row\) => row\.matchesShop\)/);
  assert.match(find, /basePrice: true/);
  assert.match(find, /startingPrice\(rows\) \?\? \(partner\.basePrice > 0 \? partner\.basePrice : null\)/);
});

test("no pickup areas yet: they pick up where they deliver", () => {
  assert.match(find, /listed\.pickupAreas\.length \? listed : \{ \.\.\.listed, pickupAreas: listed\.deliveryAreas \}/);
  const signUp = { pickupAreas: ["Rivers"], deliveryAreas: ["Rivers"], services: [] };
  const shop = { origin: { state: "Rivers" }, sellArea: "selected", sellStates: ["Rivers"] };
  assert.equal(partnerMatchesShop(signUp, shop), true);
  assert.equal(partnerMatchesShop({ ...signUp, pickupAreas: [] }, shop), false, "why the fallback is needed");
});
