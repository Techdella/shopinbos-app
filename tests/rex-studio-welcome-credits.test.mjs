// "You have 20 credits to try Rex Studio": after Rex builds a FREE seller's shop their usable credits are topped up
// to 20, once (never reduced, nothing on paid plans), with honest nudges to use them and no buying in the phone app.
// Rules in shared/rex-studio-welcome.ts; the grant in src/lib/ai/rex-studio-welcome.server.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rules = await import("../shared/rex-studio-welcome.ts");
const payments = await import("../shared/store-payments.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];
const DAY = 24 * 60 * 60 * 1000;

test("grant: a free seller is topped up to 20, never reduced", () => {
  assert.equal(rules.REX_STUDIO_WELCOME_TARGET, 20);
  assert.equal(rules.REX_STUDIO_WELCOME_REASON, "rex_studio_welcome");
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: 0, alreadyGranted: false }), { eligible: true, credits: 20 });
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: 7, alreadyGranted: false }), { eligible: true, credits: 13 });
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: 19.6, alreadyGranted: false }), { eligible: true, credits: 1 }, "part credits count down");
  // Already 20 or more: nothing added, but the marker is still written (eligible) so it never runs again.
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: 20, alreadyGranted: false }), { eligible: true, credits: 0 });
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: 70, alreadyGranted: false }), { eligible: true, credits: 0 });
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: -5, alreadyGranted: false }), { eligible: true, credits: 20 });
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: Number.NaN, alreadyGranted: false }), { eligible: true, credits: 20 });
});

test("grant: once per seller (idempotent), and only the free seller plan", () => {
  assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance: 0, alreadyGranted: true }), { eligible: false, credits: 0 });
  for (const plan of ["seller_starter", "seller_growth", "seller_pro", "supplier_free", "logistics_free", null, undefined]) {
    assert.deepEqual(rules.rexStudioWelcomeGrant({ planKey: plan, balance: 0, alreadyGranted: false }), { eligible: false, credits: 0 }, String(plan));
  }
  // Running the rule again after the first grant gives nothing more, whatever the balance became.
  let granted = false;
  let balance = 3;
  for (let run = 0; run < 3; run += 1) {
    const result = rules.rexStudioWelcomeGrant({ planKey: "seller_free", balance, alreadyGranted: granted });
    balance += result.credits;
    if (result.eligible) granted = true;
  }
  assert.equal(balance, 20);
});

test("the server: marker first (unique per seller and reason), a 30-day lot, nothing on paid plans, hooked into the build and the first publish", () => {
  const server = read("src/lib/ai/rex-studio-welcome.server.ts");
  assert.match(server, /plan !== "seller_free"\) return null/);
  assert.ok(server.indexOf("tx.aiCreditGrant.create") < server.indexOf("tx.aiCreditLot.create"), "the marker is written before the credits");
  assert.match(server, /P2002/);
  assert.match(server, /source: REX_STUDIO_WELCOME_REASON/);
  assert.equal(rules.REX_STUDIO_WELCOME_DAYS, 30);
  const now = new Date("2026-11-01T10:00:00Z");
  assert.equal(rules.rexStudioWelcomeExpiry(now).toISOString(), "2026-12-01T10:00:00.000Z");
  assert.match(read("src/lib/onboarding/rex-build.server.ts"), /grantRexStudioWelcome\(userId, \{ storeId: store\.id \}\)/);
  assert.match(read("src/lib/store-publishing.ts"), /store\.onboardingState !== "LIVE" && !options\.scheduled[\s\S]*grantRexStudioWelcome/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model AiCreditGrant \{[\s\S]*@@unique\(\[userId, reason\]\)/);
  const sql = read("docs/migrations/2026-12-20-credits-peggy.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "AiCreditGrant_userId_reason_key"/);
  assert.match(sql, /ALTER TABLE "AiCreditGrant" ENABLE ROW LEVEL SECURITY/);
});

test("meter: plenty, low under 5, out at 0", () => {
  assert.deepEqual(rules.rexStudioMeter(20), { balance: 20, target: 20, percent: 100, state: "plenty" });
  assert.deepEqual(rules.rexStudioMeter(70), { balance: 70, target: 20, percent: 100, state: "plenty" }, "capped at a full bar");
  assert.equal(rules.rexStudioMeter(10).percent, 50);
  assert.equal(rules.rexStudioMeter(5).state, "plenty");
  assert.equal(rules.rexStudioMeter(4).state, "low");
  assert.equal(rules.rexStudioMeter(1).state, "low");
  assert.equal(rules.rexStudioMeter(0).state, "out");
  assert.equal(rules.rexStudioMeter(-3).state, "out");
});

test("nudges: day 1 then day 3, only while nothing was made, two at most", () => {
  const grantedAt = new Date("2026-11-01T10:00:00Z");
  const at = (days) => new Date(grantedAt.getTime() + days * DAY);
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 0, usedSinceGrant: false, now: at(0.5) }), null, "not before a day");
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 0, usedSinceGrant: false, now: at(1) }), 0);
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 1, usedSinceGrant: false, now: at(2) }), null, "the second waits for day 3");
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 1, usedSinceGrant: false, now: at(3) }), 1);
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 2, usedSinceGrant: false, now: at(5) }), null, "never a third");
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 0, usedSinceGrant: true, now: at(1) }), null, "they made something: no reminder");
  assert.equal(rules.dueRexStudioNudge({ grantedAt, nudgesSent: 0, usedSinceGrant: false, now: at(31) }), null, "too old");
  const server = read("src/lib/ai/rex-studio-welcome.server.ts");
  assert.match(server, /event: "tip"/, "a tip: follows the seller's Tips and marketing switches");
  assert.match(server, /updateMany\(\{ where: \{ id: grant\.id, nudges: grant\.nudges \}/, "claimed before sending");
  assert.match(read("src/app/api/cron/lifecycle/route.ts"), /sendRexStudioNudges\(\)/);
});

test("card and starters: open Rex Studio with the request filled in", () => {
  assert.deepEqual([...rules.REX_STUDIO_STARTERS], ["video", "photos", "flyer"]);
  assert.equal(rules.starterProduct("  Ankara   tote  bag "), "Ankara tote bag");
  assert.equal(rules.starterProduct(""), null);
  assert.equal(rules.rexStudioStarterHref("Make 3 photos of Ada's bag", "web"), "/studio?prompt=Make%203%20photos%20of%20Ada's%20bag");
  assert.equal(rules.rexStudioStarterHref("Make a flyer", "app"), "/rex?prompt=Make%20a%20flyer");
  assert.equal(rules.showRexStudioCard(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-20T00:00:00Z")), true);
  assert.equal(rules.showRexStudioCard(new Date("2026-11-01T00:00:00Z"), new Date("2026-12-05T00:00:00Z")), false);
  assert.equal(rules.showRexStudioCard(null, new Date()), false);
  assert.match(read("src/app/home/page.tsx"), /<RexStudioWelcomeCard view=\{studio\}/);
  assert.match(read("apps/mobile/src/app/(tabs)/home.tsx"), /<RexStudioWelcomeCard \/>/);
  assert.match(read("apps/mobile/src/app/onboarding/launched.tsx"), /<RexStudioWelcomeCard compact/);
});

test("buying: the web card offers a top-up; the phone card never sells (store rules)", () => {
  const web = read("src/components/credits/RexStudioWelcomeCard.tsx");
  assert.match(web, /BuyCreditsButton/);
  assert.match(web, /inApp \? null/, "no buying on pages the phone app opened");
  const phone = read("apps/mobile/src/components/RexStudioWelcomeCard.tsx").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(phone, payments.PURCHASE_CTA);
  assert.doesNotMatch(phone, /topUp|top-up|creditsUrlFor|\/home\/credits|openWeb/);
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(CATALOGS.m_credits[lang])) assert.doesNotMatch(String(value), payments.PURCHASE_CTA, `m_credits ${lang} ${key}`);
  }
});

test("i18n: every Rex Studio and Peggy call string in all five languages, placeholders kept", () => {
  for (const ns of ["credits", "m_credits"]) {
    const en = CATALOGS[ns].en;
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(en)) {
        const text = CATALOGS[ns][lang][key];
        assert.ok(typeof text === "string" && text.trim(), `${ns} ${lang} ${key}`);
        const holes = (s) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(",");
        assert.equal(holes(text), holes(value), `${ns} ${lang} ${key} placeholders`);
      }
    }
  }
  for (const lang of LANGS) assert.ok(CATALOGS.payments[lang]["cr.kind.peggy_call_minute"], `payments ${lang}`);
});
