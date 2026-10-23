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
  assert.equal((actions.match(/requireAdminSection\("partners"\)/g) ?? []).length, 2);
  assert.equal((actions.match(/logDataAccess\(/g) ?? []).length, 2);
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
