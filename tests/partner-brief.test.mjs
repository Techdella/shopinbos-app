// Peggy's brief and Rex's ideas for suppliers and delivery partners: only real, actionable items from the
// account's own numbers, urgent ones first, and at most three ideas.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const brief = await import("../shared/partner-brief.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const supplierBase = {
  verificationStatus: "verified", toAccept: 0, dueSoon: 0, toSend: 0, quotes: 0, agreementRequests: 0, contractsToSign: 0, disputesOpen: 0,
  owedOverdue: 0, walletReady: true, products: 12, published: 12, drafts: 0, lowStock: 0, hasReturnPolicy: true, hasLogo: true, hasDescription: true,
  missedOrders: 0, deliveryPartners: 1, selfDelivery: false,
};
const partnerBase = {
  verificationStatus: "verified", newJobs: 0, dueSoon: 0, quotes: 0, unassigned: 0, riders: 3, payInOverdue: false, cashToPayIn: 0, contractsToSign: 0,
  disputesOpen: 0, walletReady: true, hasRateCard: true, hasCoverage: true, pickupPoints: 2, offersPayOnDelivery: true, connections: 0, privateRateCards: 0,
  rating: 4.6, ratingCount: 20,
};
const keys = (items) => items.map((item) => item.key);

test("a supplier with nothing waiting gets an empty brief and no ideas", () => {
  const out = brief.supplierBrief(supplierBase);
  assert.deepEqual(out.peggy, []);
  assert.deepEqual(out.rex, []);
});

test("supplier: orders running out of time come first, and aren't counted twice", () => {
  const out = brief.supplierBrief({ ...supplierBase, toAccept: 3, dueSoon: 1, toSend: 2, quotes: 1, contractsToSign: 1, agreementRequests: 2, owedOverdue: 1 });
  assert.deepEqual(keys(out.peggy), ["dueSoon", "owedOverdue", "toAccept", "toSend", "agreements", "contracts", "quotes"]);
  assert.equal(out.peggy.find((item) => item.key === "toAccept").count, 2);
  assert.ok(out.peggy.every((item) => item.href.startsWith("/supplier/")));
});

test("supplier: Rex suggests growth, three at a time", () => {
  const out = brief.supplierBrief({ ...supplierBase, drafts: 2, lowStock: 1, hasReturnPolicy: false, hasLogo: false, published: 3, missedOrders: 1 });
  assert.equal(out.rex.length, brief.MAX_IDEAS);
  assert.deepEqual(keys(out.rex), ["publishDrafts", "restock", "missed"]);
  assert.ok(out.rex.every((item) => item.who === "rex"));
  // An unverified, new supplier: verify and add a first product; pending verification isn't nagged.
  assert.deepEqual(keys(brief.supplierBrief({ ...supplierBase, verificationStatus: "unverified", products: 0, published: 0 }).peggy), ["firstProduct", "verify"]);
  assert.deepEqual(keys(brief.supplierBrief({ ...supplierBase, verificationStatus: "pending" }).peggy), []);
});

test("delivery partner: overdue cash and expiring jobs first", () => {
  const out = brief.partnerBrief({ ...partnerBase, payInOverdue: true, cashToPayIn: 5000, newJobs: 4, dueSoon: 2, unassigned: 1, contractsToSign: 2, riders: 0 });
  assert.deepEqual(keys(out.peggy), ["payInOverdue", "dueSoon", "newJobs", "unassigned", "contracts", "riders"]);
  assert.equal(out.peggy.find((item) => item.key === "newJobs").count, 2);
  assert.ok(!keys(out.peggy).includes("payIn"), "overdue replaces the due-today line");
  assert.deepEqual(keys(brief.partnerBrief({ ...partnerBase, cashToPayIn: 1200 }).peggy), ["payIn"]);
});

test("delivery partner: Rex's ideas follow what's missing", () => {
  const out = brief.partnerBrief({ ...partnerBase, hasRateCard: false, hasCoverage: false, pickupPoints: 0, connections: 4 });
  assert.deepEqual(keys(out.rex), ["rateCard", "coverage", "pickupPoints"]);
  assert.deepEqual(keys(brief.partnerBrief({ ...partnerBase, connections: 4, rating: 3.2 }).rex), ["privateRates", "rating"]);
  assert.ok(out.rex.every((item) => item.href.startsWith("/logistics/")));
});

test("every brief item has words in English", () => {
  const en = read("shared/i18n/messages/briefs/en.ts");
  const supplierKeys = ["dueSoon", "toAccept", "toSend", "owedOverdue", "disputes", "agreements", "contracts", "quotes", "firstProduct", "verify", "wallet", "publishDrafts", "restock", "missed", "returnPolicy", "delivery", "profile", "moreProducts"];
  const partnerKeys = ["payInOverdue", "dueSoon", "newJobs", "unassigned", "payIn", "disputes", "contracts", "quotes", "verify", "riders", "wallet", "rateCard", "coverage", "pickupPoints", "privateRates", "payOnDelivery", "rating", "moreRiders"];
  for (const [role, list] of [["supplier", supplierKeys], ["partner", partnerKeys]]) {
    for (const key of list) for (const part of ["title", "hint", "action"]) assert.ok(en.includes(`"${role}.${key}.${part}"`), `${role}.${key}.${part}`);
  }
  // The rules use exactly these keys.
  const rules = read("shared/partner-brief.ts");
  for (const key of new Set([...supplierKeys, ...partnerKeys])) assert.match(rules, new RegExp(`key: "${key}"`), key);
});

test("both dashboards show the brief", () => {
  assert.match(read("src/app/supplier/dashboard/page.tsx"), /<PartnerBrief\s/);
  assert.match(read("src/app/logistics/dashboard/page.tsx"), /<PartnerBrief\s/);
});
