// Contracts between businesses: the Dropship agreement says dropship (not private label), both sides sign a frozen,
// fingerprinted copy with a typed name, each keeps it under Contracts, and the admin team can only open one while a
// dispute is open, with every opening recorded.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const contracts = await import("../shared/contracts.ts");
const team = await import("../src/lib/admin-team/pure.ts");

const date = new Date("2026-11-20T10:00:00Z");
const dropship = contracts.dropshipDocument({
  shop: { name: "Amaka Styles", city: "Lagos" },
  supplier: { name: "Shea Naturals", city: "Ikeja", address: "Shop 4, Computer Village" },
  stockCheck: "visit",
  sellerNote: "Same-day to Ikeja",
  returnPolicy: null,
  date,
});
const text = (doc) => doc.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join("\n");

test("the Dropship agreement is dropship, not private label", () => {
  const body = text(dropship);
  assert.match(body, /own brand and packaging/);
  assert.match(body, /It is not private label/);
  assert.match(body, /within 3 days/);
  assert.doesNotMatch(body, /under (your|the) shop'?s name|white label/i);
  assert.equal(dropship.partyA.name, "Amaka Styles");
  assert.equal(dropship.partyB.name, "Shea Naturals");
  assert.ok(dropship.sections.some((section) => section.heading === "Notes agreed on the call"));
  assert.match(body, /visited the Supplier's shop or warehouse/);
});

test("both documents carry the privacy, dispute, data protection and e-signature clauses", () => {
  const delivery = contracts.deliveryDocument({ business: { name: "Amaka Styles", role: "seller" }, partner: { name: "Swift Riders", cacNumber: "BN123" }, date });
  for (const doc of [dropship, delivery]) {
    const body = text(doc);
    assert.match(body, /only open it if one of you raises a dispute/);
    assert.match(body, /Nigeria Data Protection Act 2023/);
    assert.match(body, /Evidence Act 2011/);
    assert.match(body, /SHA-256/);
    assert.equal(doc.version, contracts.CONTRACT_VERSION[doc.kind]);
  }
  assert.deepEqual(delivery.partyB.details, ["CAC BN123"]);
});

test("a typed signature is a full name", () => {
  assert.equal(contracts.cleanSignedName("  Amaka   Obi "), "Amaka Obi");
  assert.equal(contracts.cleanSignedName("Ọlá Adéyẹmí"), "Ọlá Adéyẹmí");
  for (const bad of ["", "Amaka", "ab", "12 34", "<b> x", null, 7, "x".repeat(90) + " y"]) assert.equal(contracts.cleanSignedName(bad), null, String(bad));
});

test("the fingerprint input is stable whatever the key order", () => {
  assert.equal(contracts.canonicalJson({ b: 1, a: [{ d: 2, c: null }] }), contracts.canonicalJson({ a: [{ c: null, d: 2 }], b: 1 }));
  assert.notEqual(contracts.canonicalJson(dropship), contracts.canonicalJson({ ...dropship, title: "Changed" }));
  assert.equal(contracts.readContractDocument(JSON.parse(JSON.stringify(dropship))).title, "Dropship agreement");
  assert.equal(contracts.readContractDocument({ kind: "other" }), null);
  assert.equal(contracts.contractReference("delivery", "ckabc12345xyz"), "SIB-DL-12345XYZ");
});

test("admin contracts are for owners and admins only", () => {
  for (const path of ["/admin/contracts", "/admin/contracts/abc"]) {
    assert.equal(team.sectionForPath(path), "restricted");
    assert.equal(team.adminCanOpen("owner", path), true);
    assert.equal(team.adminCanOpen("admin", path), true);
    for (const role of ["support", "growth", "operations", "finance", "developer"]) assert.equal(team.adminCanOpen(role, path), false, role);
  }
});

test("the server keeps contracts sealed from the team unless a dispute is open", () => {
  const server = read("src/lib/contracts/contracts.server.ts");
  assert.match(server, /if \(contract\.disputeStatus !== "open"\) return \{ ok: false, error: "This contract is sealed/);
  assert.match(server, /action: "admin_opened"/);
  assert.match(server, /contract\.disputeStatus !== "open" \|\| !contract\.disputeOpenedAt\) return null/);
  // The team's list never selects the document, signatures or where they signed.
  const list = server.slice(server.indexOf("const LIST_SELECT"), server.indexOf("} satisfies Prisma.ContractSelect"));
  for (const field of ["body", "SignedName", "Ip", "UserAgent", "sellerNote", "declineNote"]) assert.doesNotMatch(list, new RegExp(field), field);
  // A party only reads contracts it is a side of.
  assert.match(server, /OR: \[\{ partyAUserId: userId \}, \{ partyBUserId: userId \}\]/);
});

test("every way of agreeing signs a contract", () => {
  const agreements = read("src/lib/marketplace/agreements.server.ts");
  assert.match(agreements, /signDropshipAsShop\(tx/);
  assert.match(agreements, /signDropshipAsSupplier\(tx/);
  assert.match(agreements, /declineDropshipContract\(tx/);
  const delivery = read("src/lib/delivery-market/manage.server.ts");
  assert.match(delivery, /signDeliveryAsBusiness\(/);
  assert.match(delivery, /endDeliveryContracts\(/);
  for (const page of ["src/app/home/contracts/page.tsx", "src/app/supplier/contracts/page.tsx", "src/app/logistics/contracts/page.tsx", "src/app/admin/contracts/page.tsx"]) assert.ok(read(page).length > 0, page);
});
