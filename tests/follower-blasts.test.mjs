// Notify my followers: the 3-a-week cap, message checks and variables, who gets which channel (WhatsApp needs an
// opt-in, email needs no unsubscribe, push needs Plug), and that the sender follows the existing rules.
// Pure helpers in shared/follower-blasts.ts; source checks on src/lib/followers/*.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fb = await import("../shared/follower-blasts.ts");
const tc = await import("../src/lib/marketing/text-channels.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const NOW = new Date("2026-12-14T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);

test("the cap: 3 per rolling 7 days, counting queued, sending and sent", () => {
  assert.equal(fb.BLAST_CAP, 3);
  assert.equal(fb.BLAST_WINDOW_DAYS, 7);
  assert.deepEqual(fb.blastAllowance([], NOW), { cap: 3, used: 0, left: 3, nextFreeAt: null });
  const one = fb.blastAllowance([{ status: "sent", createdAt: daysAgo(1) }], NOW);
  assert.equal(one.left, 2, "2 of 3 left");
  const mixed = fb.blastAllowance(
    [
      { status: "queued", createdAt: daysAgo(0.1) },
      { status: "sending", createdAt: daysAgo(2) },
      { status: "sent", createdAt: daysAgo(6.9) },
      { status: "failed", createdAt: daysAgo(1) },
      { status: "sent", createdAt: daysAgo(7.1) },
    ],
    NOW,
  );
  assert.equal(mixed.used, 3, "failed and older than 7 days don't count");
  assert.equal(mixed.left, 0);
  assert.equal(mixed.nextFreeAt.toISOString(), new Date(daysAgo(6.9).getTime() + 7 * 86_400_000).toISOString(), "free again when the oldest leaves the window");
});

test("the cap is rolling, not per calendar week", () => {
  const blasts = [0.5, 1, 1.5].map((d) => ({ status: "sent", createdAt: daysAgo(d) }));
  assert.equal(fb.blastAllowance(blasts, NOW).left, 0);
  const later = new Date(NOW.getTime() + 5.4 * 86_400_000);
  assert.equal(fb.blastAllowance(blasts, later).left, 0, "5.4 days later the oldest is 6.9 days old: still counted");
  const muchLater = new Date(NOW.getTime() + 5.6 * 86_400_000);
  assert.equal(fb.blastAllowance(blasts, muchLater).left, 1, "the oldest (now 7.1 days) left the window");
  assert.ok(fb.blastWindowStart(NOW) < NOW);
});

test("message checks: kinds, copy limits, https links", () => {
  assert.deepEqual([...fb.FOLLOWER_BLAST_KINDS], ["drop", "preorder", "live"]);
  const good = fb.checkBlast({ kind: "live", title: "  We're  going live ", body: "Hi {{first_name}},\n\n\n\njoin us tonight", link: "https://instagram.com/adire" });
  assert.deepEqual(good.problems, []);
  assert.equal(good.input.title, "We're going live");
  assert.equal(good.input.body, "Hi {{first_name}},\n\njoin us tonight");
  assert.equal(good.input.link, "https://instagram.com/adire");
  assert.deepEqual(fb.checkBlast({ kind: "sale", title: "", body: "" }).problems, ["kind", "title_missing", "body_missing"]);
  const long = fb.checkBlast({ kind: "drop", title: "x".repeat(fb.TITLE_MAX + 1), body: "y".repeat(fb.BODY_MAX + 1), link: "http://insecure.example" });
  assert.deepEqual(long.problems, ["title_long", "body_long", "link_bad"]);
  assert.equal(long.input.link, null);
  assert.equal(fb.checkBlast({ kind: "drop", title: "a", body: "b", link: "javascript:alert(1)" }).problems[0], "link_bad");
  assert.equal(fb.checkBlast({ kind: "drop", title: "a", body: "b", productId: "  " }).input.productId, null);
});

test("template variables: first name, shop and product, unknown ones removed", () => {
  const text = "Hi {{ first_name }}, {{product_name}} is at {{store_name}}. {{discount_code}}";
  assert.equal(fb.fillBlastText(text, { first_name: "Ada", store_name: "Adire House", product_name: "Kaftan" }), "Hi Ada, Kaftan is at Adire House.");
  assert.equal(fb.fillBlastText("Hi {{first_name}}!", {}), "Hi there!");
  const news = fb.whatsappNewsText({ title: "New drop!", body: "Hi {{first_name}},\nkaftans\tare back" }, { first_name: "Bola" });
  assert.equal(news, "New drop: Hi Bola, kaftans are back");
  assert.ok(!/[\n\t]| {2,}/.test(news), "no newlines, tabs or runs of spaces (Meta refuses them)");
  for (const kind of fb.FOLLOWER_BLAST_KINDS) {
    const copy = fb.defaultBlastCopy(kind, { storeName: "Adire House", productName: kind === "live" ? null : "Kaftan" });
    assert.ok(copy.title.length <= fb.TITLE_MAX && copy.body.length <= fb.BODY_MAX, kind);
    assert.deepEqual(fb.checkBlast({ kind, ...copy }).problems, []);
  }
});

const reach = (over = {}) => ({ whatsappOptIn: false, whatsappConsent: false, whatsappOptedOut: false, email: null, emailSuppressed: false, pushTokens: 0, ...over });
const ALL = ["whatsapp", "email", "push"];
const READY = { whatsapp: true, email: true, push: true };

test("WhatsApp needs an opt-in (or existing marketing consent) and no STOP; a checkout phone alone isn't enough", () => {
  assert.deepEqual(fb.followerChannels(reach(), ALL, READY), [], "a buyer with only a checkout phone gets nothing");
  assert.deepEqual(fb.followerChannels(reach({ whatsappOptIn: true }), ALL, READY), ["whatsapp"]);
  assert.deepEqual(fb.followerChannels(reach({ whatsappConsent: true }), ALL, READY), ["whatsapp"]);
  assert.deepEqual(fb.followerChannels(reach({ whatsappOptIn: true, whatsappOptedOut: true }), ALL, READY), [], "STOP wins");
  assert.deepEqual(fb.followerChannels(reach({ whatsappOptIn: true }), ALL, { ...READY, whatsapp: false }), [], "no approved template / not connected");
  assert.deepEqual(fb.followerChannels(reach({ whatsappOptIn: true }), ["email"], READY), [], "only the channels picked");
});

test("email needs an address and no unsubscribe; push needs Plug", () => {
  assert.deepEqual(fb.followerChannels(reach({ email: "ada@example.com" }), ALL, READY), ["email"]);
  assert.deepEqual(fb.followerChannels(reach({ email: "ada@example.com", emailSuppressed: true }), ALL, READY), []);
  assert.deepEqual(fb.followerChannels(reach({ email: "not-an-email" }), ALL, READY), []);
  assert.deepEqual(fb.followerChannels(reach({ email: "ada@example.com" }), ALL, { ...READY, email: false }), [], "no business address / email off");
  assert.deepEqual(fb.followerChannels(reach({ pushTokens: 2 }), ALL, { ...READY, push: false }), [], "push sends to nobody before Plug");
  assert.deepEqual(fb.followerChannels(reach({ pushTokens: 2 }), ALL, READY), ["push"]);
  const counts = fb.countAudience([reach({ whatsappOptIn: true, email: "a@b.co" }), reach({ email: "c@d.co" }), reach()], ALL, READY);
  assert.deepEqual(counts, { followers: 3, whatsapp: 1, email: 2, push: 0, reachable: 2 });
});

test("one message per follower per channel per blast; final status", () => {
  assert.equal(fb.blastRefId("blast1", "shopper9"), "blast1:shopper9");
  assert.equal(fb.BLAST_EVENT, "follower_blast");
  assert.equal(fb.blastFinalStatus({ sent: 3, failed: 1, queued: 0 }), "sent");
  assert.equal(fb.blastFinalStatus({ sent: 0, failed: 4, queued: 0 }), "failed", "nothing went out: doesn't use a slot");
  assert.equal(fb.blastFinalStatus({ sent: 1, failed: 0, queued: 5 }), "sending");
});

test("the WhatsApp template is a valid marketing template with Stop promotions, outside the campaign gallery", () => {
  const preset = tc.presetTemplate(fb.FOLLOWER_TEMPLATE_PRESET);
  assert.ok(preset);
  assert.equal(preset.category, "MARKETING");
  assert.deepEqual(tc.templateProblems({ name: preset.name, category: preset.category, language: "en", content: preset.content, variables: preset.variables }), []);
  assert.ok(preset.content.buttons.some((b) => b.text === "Stop promotions"));
  assert.ok(preset.variables.includes("follower_news"));
  assert.ok(!tc.TEMPLATE_PRESETS.includes(preset));
});

test("the sender follows the existing rules", () => {
  const blasts = read("src/lib/followers/blasts.server.ts");
  assert.match(blasts, /pg_advisory_xact_lock/, "the cap is checked under a per-store lock");
  assert.match(blasts, /storeEmail\(\{[\s\S]*kind: "marketing"[\s\S]*unsubscribeUrl: links\.unsubscribe[\s\S]*preferencesUrl: links\.preferences/, "emails use the store shell with unsubscribe links");
  assert.match(blasts, /headers: unsubscribeHeaders\(links\)/, "one-click List-Unsubscribe");
  assert.match(blasts, /contactAllows\(byEmail\.get\(address\) \?\? null, "promotions"\)/, "skips people who unsubscribed or turned Promotions off");
  assert.match(blasts, /MISSING_ADDRESS_MESSAGE/, "marketing email needs the business address");
  assert.match(blasts, /isOptedOut\(optOuts, "whatsapp", row\.to, "marketing"\)/, "STOP is checked right before each WhatsApp");
  assert.match(blasts, /isMarketingOptOutError/, "Meta's 'stopped marketing messages' is recorded");
  const followers = read("src/lib/followers/followers.server.ts");
  assert.match(followers, /isOptedOut\(optOuts, "whatsapp", phone, "marketing"\)/);
  assert.match(read("src/lib/shoppers.server.ts"), /await addOrderFollower\(order\.storeId, shopperId\)/, "buyers follow the shop");
  assert.match(followers, /export async function addOrderFollower[\s\S]*?catch \(error\)/, "never throws into the order flow");
});
