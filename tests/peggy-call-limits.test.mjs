// "Talk to Peggy" on free plans: 3 free calls a Lagos month, each at most 10 minutes (enforced by ElevenLabs' agent
// max_duration_seconds, with a 9:00 warning and a tidy end at 10:00 in the apps), then calls cost AI credits by the
// minute: 10 minutes held when the call starts, settled to the real length, the rest given back. Paid plans keep
// their allowance (no monthly cap, 15-minute calls). Rules in shared/peggy-call-limits.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const limits = await import("../shared/peggy-call-limits.ts");
const credits = await import("../shared/ai-credits.ts");
const pricing = await import("../shared/platform-pricing.ts");
const payments = await import("../shared/store-payments.ts");
const webhook = await import("../src/lib/ai/elevenlabs-webhook.ts");

test("the Lagos month: calls reset at midnight on the 1st in Lagos (UTC+1)", () => {
  assert.equal(limits.lagosMonth(new Date("2026-10-31T22:59:00Z")), "2026-10");
  assert.equal(limits.lagosMonth(new Date("2026-10-31T23:00:00Z")), "2026-11", "00:00 on 1 November in Lagos");
  assert.equal(limits.lagosMonthStart(new Date("2026-11-15T12:00:00Z")).toISOString(), "2026-10-31T23:00:00.000Z");
  assert.equal(limits.lagosMonthStart(new Date("2026-10-31T23:30:00Z")).toISOString(), "2026-10-31T23:00:00.000Z");
  assert.equal(limits.lagosMonthStart(new Date("2027-01-01T00:30:00Z")).toISOString(), "2026-12-31T23:00:00.000Z", "across the year");
  assert.match(read("src/lib/ai/peggy-voice.server.ts"), /createdAt: \{ gte: lagosMonthStart\(now\) \}/);
});

test("3 free calls a month on every free plan, then credits; paid plans unchanged", () => {
  assert.equal(limits.FREE_PEGGY_CALLS_PER_MONTH, 3);
  for (const plan of ["seller_free", "supplier_free", "logistics_free"]) {
    assert.deepEqual(limits.peggyCallTerms({ planKey: plan, usedThisMonth: 0 }), { mode: "free", maxSeconds: 600, callsLeft: 2, perMinute: 0, hold: 0 }, plan);
    assert.equal(limits.peggyCallTerms({ planKey: plan, usedThisMonth: 2 }).mode, "free");
    assert.equal(limits.peggyCallTerms({ planKey: plan, usedThisMonth: 2 }).callsLeft, 0);
    assert.deepEqual(limits.peggyCallTerms({ planKey: plan, usedThisMonth: 3 }), { mode: "credits", maxSeconds: 600, callsLeft: 0, perMinute: 10, hold: 100 });
    assert.equal(limits.peggyCallTerms({ planKey: plan, usedThisMonth: 9 }).mode, "credits");
  }
  for (const plan of ["seller_starter", "seller_growth", "seller_pro", "supplier_plus", "supplier_pro", "logistics_plus", "logistics_pro"]) {
    assert.deepEqual(limits.peggyCallTerms({ planKey: plan, usedThisMonth: 40 }), { mode: "plan", maxSeconds: 900, callsLeft: null, perMinute: 0, hold: 0 }, plan);
  }
});

test("the 10-minute cap: free plans only; paid plans keep the existing 15-minute per-call cap", () => {
  assert.equal(limits.FREE_CALL_MAX_SECONDS, 600);
  assert.equal(limits.PAID_CALL_MAX_SECONDS, 900);
  assert.equal(limits.callMaxSeconds("seller_free"), 600);
  assert.equal(limits.callMaxSeconds("logistics_free"), 600);
  assert.equal(limits.callMaxSeconds("seller_growth"), 900);
  assert.deepEqual(limits.callTimeline(600), { warnAt: 540, endAt: 600 });
  assert.equal(limits.callPhaseAt(0, 600), "ok");
  assert.equal(limits.callPhaseAt(539, 600), "ok");
  assert.equal(limits.callPhaseAt(540, 600), "warning", "9:00: one minute left");
  assert.equal(limits.callPhaseAt(600, 600), "over", "10:00: the call ends");
  assert.match(limits.ONE_MINUTE_LEFT_NOTE, /one minute left/i);
  assert.match(limits.ONE_MINUTE_LEFT_NOTE, /sum up/i);
  // Enforced server-side: the free agent's own max_duration_seconds, chosen by the server from the plan.
  const server = read("src/lib/ai/peggy-voice.server.ts");
  assert.match(server, /conversation: \{ max_duration_seconds: maxSeconds \}/);
  assert.match(server, /agentId\(opened\.terms\.maxSeconds\)/);
  assert.match(server, /setting: `\$\{SETTING\}\.free`/);
  assert.doesNotMatch(server, /MAX_CALL_SECONDS = 900/);
  // And in the apps: the warning, the contextual update to Peggy and the hang-up.
  for (const file of ["src/components/peggy/PeggyCall.tsx", "apps/mobile/src/components/peggy/PeggyCallEngine.tsx"]) {
    const code = read(file);
    assert.match(code, /sendContextualUpdate\(ONE_MINUTE_LEFT_NOTE\)/, file);
    assert.match(code, /peggy-call\/end|endCallSession/, file);
  }
});

test("credit pricing after the free calls: 10 credits a minute by default, set in Admin › Pricing", () => {
  assert.equal(limits.PEGGY_CALL_MINUTE_CREDITS, 10);
  assert.equal(credits.ACTION_COST.peggy_call_minute, 10);
  assert.equal(credits.creditCost("peggy_call_minute"), 10);
  assert.equal(pricing.PRICE_SETTINGS["credits.cost.peggy_call_minute"].default, 10);
  for (const role of ["seller", "supplier", "logistics_partner"]) assert.ok(credits.COSTS_BY_ROLE[role].includes("peggy_call_minute"), role);
  assert.equal(limits.peggyCallTerms({ planKey: "seller_free", usedThisMonth: 3, perMinute: 15 }).hold, 150, "the admin price is used");
  assert.equal(limits.peggyCallTerms({ planKey: "seller_free", usedThisMonth: 3, perMinute: 0 }).perMinute, 1, "never free by mistake");
});

test("hold and settle: hold 10 minutes, keep the started minutes, give the rest back", () => {
  assert.equal(limits.peggyCallHold(10), 100);
  assert.equal(limits.peggyCallHold(10, 900), 150);
  assert.equal(limits.billableMinutes(0), 0);
  assert.equal(limits.billableMinutes(9), 0, "a line that never really opened");
  assert.equal(limits.billableMinutes(10), 1);
  assert.equal(limits.billableMinutes(60), 1);
  assert.equal(limits.billableMinutes(61), 2);
  assert.equal(limits.billableMinutes(10_000), 10, "never past the cap");
  assert.deepEqual(limits.settlePeggyCall({ held: 100, perMinute: 10, seconds: 185 }), { minutes: 4, charge: 40, refund: 60 });
  assert.deepEqual(limits.settlePeggyCall({ held: 100, perMinute: 10, seconds: 600 }), { minutes: 10, charge: 100, refund: 0 });
  assert.deepEqual(limits.settlePeggyCall({ held: 100, perMinute: 10, seconds: 3 }), { minutes: 0, charge: 0, refund: 100 });
  assert.deepEqual(limits.settlePeggyCall({ held: 100, perMinute: 10, seconds: 1200 }), { minutes: 10, charge: 100, refund: 0 });
  assert.deepEqual(limits.settlePeggyCall({ held: 0, perMinute: 0, seconds: 300 }), { minutes: 5, charge: 0, refund: 0 }, "a free call");
  assert.deepEqual(limits.settlePeggyCall({ held: 50, perMinute: 10, seconds: 590 }), { minutes: 10, charge: 50, refund: 0 }, "never more than was held");
  for (const seconds of [0, 12, 59, 61, 333, 599, 600, 700]) {
    const { charge, refund } = limits.settlePeggyCall({ held: 100, perMinute: 10, seconds });
    assert.equal(charge + refund, 100, `${seconds}s adds up`);
    assert.ok(charge >= 0 && refund >= 0);
  }
});

test("settled once, from ElevenLabs' length (webhook or its API), never the app's word", () => {
  const server = read("src/lib/ai/peggy-voice.server.ts");
  assert.match(server, /updateMany\(\{\s*where: \{ id: session\.id, status: "open" \}/, "open → settled by one caller only");
  assert.match(server, /addCredits\(session\.userId, result\.refund, "refund"/);
  assert.match(server, /facts\.callRef !== session\.id \|\| facts\.userRef !== userId/, "the conversation must be this call");
  assert.match(server, /throw new PeggyCallCreditsError/);
  assert.match(server, /autoTopUp: !options\.inApp/, "the phone app never charges a saved card");
  const payload = { type: "post_call_transcription", data: { conversation_id: "conv_1", metadata: { call_duration_secs: 245 }, conversation_initiation_client_data: { dynamic_variables: { user_ref: "u1", call_ref: "call_1" } } } };
  assert.deepEqual(webhook.readCallLength(payload), { userId: "u1", callRef: "call_1", conversationId: "conv_1", seconds: 245 });
  assert.equal(webhook.readCallLength({ type: "post_call_audio" }), null);
  assert.equal(webhook.readCallLength({ type: "post_call_transcription", data: {} }), null);
  assert.match(read("src/app/api/webhooks/elevenlabs/route.ts"), /settleFromWebhook\(length\)/);
  assert.match(read("src/app/api/cron/lifecycle/route.ts"), /sweepPeggyCallHolds\(\)/);
  const sql = read("docs/migrations/2026-12-20-credits-peggy.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PeggyCallSession"/);
  assert.match(sql, /ALTER TABLE "PeggyCallSession" ENABLE ROW LEVEL SECURITY/);
});

test("no credits: the out-of-credits prompt; a top-up on the web, none in the phone apps", () => {
  const web = read("src/app/api/app/peggy-call/route.ts");
  assert.match(web, /code: "AI_CREDITS_NEEDED"/);
  assert.match(web, /inApp \? \{\} : \{ buyUrl: creditsUrlFor\(user\.role\) \}/);
  for (const file of ["src/app/api/mobile/peggy-call/route.ts", "src/app/api/public/peggy-call/route.ts"]) {
    const code = read(file);
    assert.match(code, /AI_CREDITS_NEEDED/, file);
    assert.doesNotMatch(code, /buyUrl/, file);
  }
  assert.equal(payments.storeSafeKind("AI_CREDITS_NEEDED", 402, "x"), "credits", "the phone shows its calm credits note");
  const phone = ["apps/mobile/src/components/CallPeggyButton.tsx", "apps/mobile/src/components/peggy/PeggyCallViews.tsx", "apps/mobile/src/components/peggy/PeggyCallEngine.tsx", "apps/mobile/src/lib/peggy-call.ts"]
    .map((file) => read(file).replace(/\/\/.*$/gm, ""))
    .join("\n");
  assert.doesNotMatch(phone, payments.PURCHASE_CTA);
  assert.doesNotMatch(phone, /buyUrl|creditsUrlFor|\/home\/credits/);
  assert.match(read("src/components/peggy/PeggyCall.tsx"), /creditsNeeded && !inApp \? <BuyCreditsButton/);
});
