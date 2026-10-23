// Weekly tips from Rex & Peggy: the library, the Lagos schedule, who gets which tip, the email and STOP.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { TIPS } = await import("../src/lib/member-messaging/tips-library.ts");
const e = await import("../src/lib/member-messaging/tips-email.ts");

test("tips: enough for each role, with sound content and real pages", () => {
  const ids = new Set();
  for (const role of ["seller", "supplier", "logistics_partner"]) assert.ok(TIPS.filter((tip) => tip.role === role).length >= 12, role);
  for (const tip of TIPS) {
    assert.ok(!ids.has(tip.id), `${tip.id} unique`);
    ids.add(tip.id);
    assert.match(tip.id, /^[a-z0-9-]+$/);
    assert.ok(tip.subject.length <= 60 && tip.title.length <= 70 && tip.preheader.length <= 90, tip.id);
    assert.ok(tip.points.length >= 3 && tip.points.length <= 5, tip.id);
    assert.ok(tip.whatsapp.length <= 300 && !/\n|https?:/.test(tip.whatsapp), `${tip.id}: WhatsApp text is one line, no links`);
    assert.ok(tip.cta.label.length <= 25, tip.id);
    const prefix = { seller: /^\/(home|marketplace|products|studio|refer|channels|builder)/, supplier: /^\/(supplier|refer)/, logistics_partner: /^\/(logistics|refer)/ }[tip.role];
    assert.match(tip.cta.path, prefix, `${tip.id}: links into its own portal`);
  }
  assert.ok(TIPS.some((tip) => tip.topic === "dropshipping" || /dropship/i.test(tip.title)), "dropshipping is covered");
  assert.ok(TIPS.some((tip) => tip.topic === "rex-videos"), "Rex videos are covered");
  assert.ok(TIPS.some((tip) => tip.topic === "ads"), "ads are covered");
});

test("tips: WhatsApp on Wednesday, email on Thursday, from 10:00 Lagos, never late at night or on Sunday", () => {
  const at = (iso) => new Date(iso);
  assert.equal(e.tipWeek(at("2026-11-25T09:00:00Z")), "2026-11-23", "Wednesday is in the week of Monday 23rd");
  assert.equal(e.tipWeek(at("2026-11-29T22:30:00Z")), "2026-11-23", "Sunday 23:30 Lagos is still that week");
  assert.equal(e.tipWeek(at("2026-11-29T23:30:00Z")), "2026-11-30", "Monday 00:30 Lagos starts the next week");
  assert.equal(e.tipDue("whatsapp", at("2026-11-25T08:59:00Z")), false, "Wednesday 09:59 Lagos");
  assert.equal(e.tipDue("whatsapp", at("2026-11-25T09:00:00Z")), true, "Wednesday 10:00 Lagos");
  assert.equal(e.tipDue("email", at("2026-11-25T12:00:00Z")), false, "email waits for Thursday");
  assert.equal(e.tipDue("email", at("2026-11-26T09:00:00Z")), true);
  assert.equal(e.tipDue("email", at("2026-11-27T20:00:00Z")), false, "21:00 Lagos is too late");
  assert.equal(e.tipDue("email", at("2026-11-28T10:00:00Z")), true, "a missed Thursday catches up on Saturday");
  assert.equal(e.tipDue("email", at("2026-11-29T10:00:00Z")), false, "never on Sunday");
});

test("tips: people get them in order across both channels, then the oldest again", () => {
  const sellerTips = TIPS.filter((tip) => tip.role === "seller");
  assert.equal(e.nextTip(TIPS, "seller", []).id, sellerTips[0].id);
  const history = [{ ref: sellerTips[0].id, at: new Date("2026-11-25") }];
  assert.equal(e.nextTip(TIPS, "seller", history).id, sellerTips[1].id, "Thursday's email isn't Wednesday's WhatsApp tip");
  const all = sellerTips.map((tip, i) => ({ ref: tip.id, at: new Date(Date.UTC(2026, 0, 1 + i)) }));
  assert.equal(e.nextTip(TIPS, "seller", all).id, sellerTips[0].id, "after the last one, start again from the oldest");
});

test("tips: the email is escaped, signed by Rex or Peggy, and sellers see what's selling", () => {
  const tip = { ...TIPS[0], intro: "Use <b>bold</b> & more", from: "rex" };
  const email = e.renderTipEmail(tip, { firstName: "Ada", ctaUrl: "https://app.shopinbos.com/tip/x?m=1", products: [{ name: "Ankara tote", price: 12500, image: null, url: "https://app.shopinbos.com/marketplace/product/p1", note: "added by 4 shops" }], marketplaceUrl: "https://app.shopinbos.com/marketplace" });
  assert.match(email.bodyHtml, /Use &lt;b&gt;bold&lt;\/b&gt; &amp; more/);
  assert.equal(email.persona, "rex", "Rex signs it (the shell adds his signature and picture)");
  assert.match(email.bodyHtml, /Hello Ada 👋🏾,/);
  assert.match(email.bodyHtml, /What's selling this week 🔥/);
  assert.match(email.bodyHtml, /₦12,500/);
  assert.equal(email.cta.url, "https://app.shopinbos.com/tip/x?m=1");
  assert.equal(email.eyebrow, "Tip of the week · from Rex");
  assert.equal(e.whatsappTipText({ ...TIPS[0], whatsapp: "keep it  short." }), "Keep it short.");
  assert.equal(e.firstNameOf("ada@x.com"), "there");
});

test("tips: STOP replies, and the job is scheduled and off until an admin switches it on", () => {
  for (const word of ["STOP", "stop", " Stop tips ", "unsubscribe", "STOP."]) assert.equal(e.isStopWord(word), true, word);
  for (const word of ["stop by tomorrow", "please don't stop", ""]) assert.equal(e.isStopWord(word), false, word);
  const server = fs.readFileSync("src/lib/member-messaging/tips.server.ts", "utf8");
  assert.match(server, /email: value\.email === true, whatsapp: value\.whatsapp === true/, "both channels default to off");
  assert.match(server, /topic: "tips"/, "emails follow the tips preference");
  assert.match(fs.readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8"), /isStopWord\(message\.text\)/);
  assert.match(fs.readFileSync("docs/migrations/2026-11-24-member-messages.sql", "utf8"), /'member-tips'/);
});
