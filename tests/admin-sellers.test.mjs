// Admin › Sellers under the Nigeria Data Protection Act: masked contacts, reasons, a short logged reveal, no export.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const p = await import("../shared/privacy.ts");
const read = (path) => fs.readFileSync(path, "utf8");

test("privacy: email, phone and bank account are masked", () => {
  assert.equal(p.maskEmail("adaeze.okafor@gmail.com"), "ad•••@gmail.com");
  assert.equal(p.maskEmail(null), null);
  assert.equal(p.maskPhone("+2348031234567"), "+234 ••• ••• 4567");
  assert.equal(p.maskPhone("08031234567"), "••• ••• 4567");
  assert.equal(p.maskAccount("0123456789"), "•••• 6789");
  for (const masked of [p.maskEmail("adaeze.okafor@gmail.com"), p.maskPhone("+2348031234567"), p.maskAccount("0123456789")]) {
    assert.ok(!/okafor|803123|012345/.test(masked));
  }
});

test("privacy: only listed reasons count", () => {
  assert.equal(p.asRevealReason("support"), "support");
  assert.equal(p.asRevealReason("curious"), null);
  assert.equal(p.asShopActionReason("safety"), "safety");
  assert.equal(p.asShopActionReason(""), null);
});

test("privacy: a reveal shows for the same admin and person only, for a few minutes", () => {
  const createdAt = new Date("2026-11-26T10:00:00Z");
  const row = { adminId: "a1", subjectUserId: "u1", action: "reveal_contact", createdAt };
  const later = (minutes) => new Date(createdAt.getTime() + minutes * 60_000);
  assert.equal(p.revealStillValid(row, "a1", "u1", later(5)), true);
  assert.equal(p.revealStillValid(row, "a1", "u1", later(p.REVEAL_MINUTES + 1)), false);
  assert.equal(p.revealStillValid(row, "a2", "u1", later(1)), false);
  assert.equal(p.revealStillValid(row, "a1", "u2", later(1)), false);
  assert.equal(p.revealStillValid({ ...row, action: "suspend_store" }, "a1", "u1", later(1)), false);
  assert.equal(p.revealStillValid(null, "a1", "u1", later(1)), false);
});

test("admin sellers: in the Partners section and the nav; logged actions; no buyer details or export", () => {
  const pure = read("src/lib/admin-team/pure.ts");
  assert.equal((pure.match(/ sellers: "partners"/g) ?? []).length, 2);
  assert.match(read("src/lib/nav.ts"), /id: "sellers".*href: "\/admin\/sellers"/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) assert.match(read(`shared/i18n/messages/nav/${lang}.ts`), /"admin\.sellers":/);

  const actions = read("src/app/admin/sellers/actions.ts");
  assert.equal((actions.match(/requireAdminSection\("partners"\)/g) ?? []).length, 3);
  assert.equal((actions.match(/logDataAccess\(/g) ?? []).length, 3);
  // The reveal is logged before the page shows anything, and the address carries the log id, never the details.
  assert.match(actions, /const row = await logDataAccess[\s\S]*redirect\(`\/admin\/sellers\/\$\{storeId\}\?reveal=\$\{row\.id\}/);

  const pages = read("src/app/admin/sellers/page.tsx") + read("src/app/admin/sellers/[id]/page.tsx");
  assert.match(pages, /requireAdminSection\("partners"\)/);
  assert.ok(!/buyerEmail|buyerName|buyerPhone|deliveryAddress|accountNumber\}/.test(pages), "pages never show a shop's buyers or a full account number");
  assert.ok(!/csv|export|download/i.test(pages.replace(/export default/g, "").replace(/There&apos;s no export/g, "")));
  assert.match(read("src/app/admin/sellers/[id]/page.tsx"), /reveal \? owner\.email : maskEmail\(owner\.email\)/);

  const server = read("src/lib/admin/sellers.server.ts");
  assert.match(server, /groupBy\(\{ by: \["buyerEmail"\][\s\S]*rows\.length/);
  assert.match(server, /email: \{ equals: q/);
});

test("admin sellers: 'paid plan' means paid through Paystack; free plan time (PlanGrant) is counted apart", () => {
  const source = read("src/lib/admin/plan-source.server.ts");
  assert.match(source, /PAID_THROUGH_PAYSTACK[\s\S]*planStatus: \{ in: \["active", "non_renewing"\] \}[\s\S]*paymentReceipts: \{ some: \{\} \}/);
  assert.match(source, /const paidPlan = Boolean\(tiered && user && \(user\.planStatus === "active" \|\| user\.planStatus === "non_renewing" \|\| user\._count\.paymentReceipts > 0\)\)/);
  const server = read("src/lib/admin/sellers.server.ts");
  assert.match(server, /filter === "paid"\) return \{ user: \{ aiCredits: \{ in: PAID_SELLER_MARKERS \}, \.\.\.PAID_THROUGH_PAYSTACK \} \}/);
  assert.match(server, /filter === "gifted"\) return \{ user: \{ aiCredits: \{ in: PAID_SELLER_MARKERS \}, NOT: PAID_THROUGH_PAYSTACK \} \}/);
  assert.ok(!/paidPlan: PAID_SELLER_MARKERS\.includes/.test(server), "a tier marker alone is not a payment");
});

test("admin logistics: partners show their plan, paid through Paystack or free time", () => {
  const list = read("src/app/admin/logistics-partners/page.tsx");
  assert.match(list, /planSource\("logistics_partner"/);
  assert.match(list, /planFor\(row\.userId\)\.giftNote/);
  const detail = read("src/app/admin/logistics-partners/[id]/page.tsx");
  assert.match(detail, /planSource\("logistics_partner"/);
  assert.match(detail, /label="Plan"/);
});
