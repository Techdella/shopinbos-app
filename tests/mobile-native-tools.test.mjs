// Phone app screens that used to open the website: Sell everywhere (app/channels.tsx), review moderation and Ask
// for reviews (app/reviews), legal pages as plain text (app/legal/[key].tsx) and Subscribers
// (app/marketing/subscribers.tsx). Pure helpers run directly; routes are checked from source (auth, validation, and
// that they call the same lib functions as the web instead of repeating its rules).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const sc = await import("../src/lib/sales-channels/pure.ts");
const reviews = await import("../src/lib/reviews/pure.ts");
const md = await import("../src/lib/cms/markdown.ts");
const legal = await import("../src/lib/legal/pages.ts");
const channelsApp = await import("../apps/mobile/src/lib/channels-pure.ts");
const ask = await import("../apps/mobile/src/lib/review-ask.ts");

// ─── Sell everywhere ────────────────────────────────────────────────────────

test("the sign-in only returns to the app's own scheme, or Expo Go on this computer / the local network", () => {
  for (const ok of ["shopinbos://channels", "shopinbos:///channels", "exp://127.0.0.1:8081/--/channels", "exp://192.168.1.20:8081/--/channels", "exp://10.0.2.2:8081/--/channels", "exp://localhost:8081/--/channels", "exp://172.20.10.3:8081/--/channels"]) {
    assert.equal(sc.appReturnUrl(ok), ok, ok);
  }
  for (const bad of [null, "", "https://evil.example/channels", "http://localhost:3000/x", "exp://evil.example:8081/--/channels", "exps://u.exp.direct/--/channels", "exp://8.8.8.8/--/channels", "javascript:alert(1)", "shopinbos://x y", "shopinbos://user:pass@channels", `shopinbos://${"a".repeat(400)}`]) {
    assert.equal(sc.appReturnUrl(bad), null, String(bad));
  }
});

test("the app hears how the sign-in went", () => {
  assert.equal(sc.appResultUrl("shopinbos://channels", "meta", "connected"), "shopinbos://channels?connected=meta");
  assert.equal(sc.appResultUrl("exp://127.0.0.1:8081/--/channels?problem=google", "tiktok", "closed"), "exp://127.0.0.1:8081/--/channels?closed=tiktok");
  for (const result of ["connected", "problem", "closed"]) {
    assert.equal(channelsApp.connectOutcome(sc.appResultUrl("shopinbos://channels", "google", result), "google"), result);
  }
  assert.equal(channelsApp.connectOutcome("shopinbos://channels?connected=meta", "google"), "closed", "another platform's result doesn't count");
  assert.equal(channelsApp.connectOutcome(null, "meta"), "closed");
});

test("the app starts the sign-in through the handoff page with the token in the fragment", () => {
  const url = channelsApp.connectStartUrl("https://app.shopinbos.com", "meta", "shopinbos://channels", "a.b.c");
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/auth/handoff");
  assert.equal(parsed.searchParams.get("next"), "/api/app/sales-channels/meta/connect?app=shopinbos%3A%2F%2Fchannels");
  assert.equal(parsed.hash, "#t=a.b.c", "never in the query string or a server log");
  assert.equal(channelsApp.connectStartUrl("https://x.ng", "google", "shopinbos://channels", null), "https://x.ng/api/app/sales-channels/google/connect?app=shopinbos%3A%2F%2Fchannels");
  assert.equal(channelsApp.canDisconnect({ kind: "connect" }), false);
  assert.equal(channelsApp.canDisconnect({ kind: "soon" }), false);
  assert.equal(channelsApp.canDisconnect({ kind: "connected", count: 3 }), true);
});

test("card actions: Try again for live platforms, Tell me when it's ready only for coming-soon ones", () => {
  assert.equal(sc.channelActionAllowed("whatsapp", "retry"), true);
  assert.equal(sc.channelActionAllowed("meta", "retry"), true);
  assert.equal(sc.channelActionAllowed("pinterest", "retry"), false);
  assert.equal(sc.channelActionAllowed("jumia", "notify"), true);
  assert.equal(sc.channelActionAllowed("meta", "notify"), false);
  assert.equal(sc.channelActionAllowed("__proto__", "notify"), false);
  assert.equal(sc.isLivePlatform("google"), true);
  assert.equal(sc.isLivePlatform("etsy"), false);
});

test("sales-channel routes: seller only, the same lib calls as the web's actions, app return checked", () => {
  const list = read("src/app/api/app/sales-channels/route.ts");
  assert.match(list, /export const GET = withSeller/);
  assert.match(list, /channelCards\(store\.id\)/, "the same cards as /channels");
  const one = read("src/app/api/app/sales-channels/[platform]/route.ts");
  assert.match(one, /export const POST = withSeller/);
  assert.match(one, /export const DELETE = withSeller/);
  assert.match(one, /z\.enum\(\["retry", "notify"\]\)/);
  assert.match(one, /channelActionAllowed\(platform, parsed\.data\.action\)/);
  for (const fn of ["recordInterest(", "connectWhatsAppCatalog(", "syncPlatform(", "disconnectPlatform("]) {
    assert.ok(one.includes(fn), fn);
    assert.ok(read("src/app/channels/actions.ts").includes(fn), `the web action uses ${fn} too`);
  }
  const connect = read("src/app/api/app/sales-channels/[platform]/connect/route.ts");
  assert.match(connect, /appReturnUrl\(req\.nextUrl\.searchParams\.get\("app"\)\)/);
  assert.match(connect, /response\.cookies\.set\(appReturnCookieName\(platform\), app, \{ httpOnly: true/);
  const callback = read("src/app/api/app/sales-channels/[platform]/callback/route.ts");
  assert.match(callback, /appReturnUrl\(req\.cookies\.get\(appReturnCookieName\(platform\)\)\?\.value\)/, "the cookie is checked again before redirecting");
  assert.ok(callback.indexOf("checkCallbackState(") < callback.indexOf("appResultUrl("), "the state check still runs first");
});

// ─── Reviews ────────────────────────────────────────────────────────────────

test("review moderation: featuring publishes, unfeaturing leaves the status alone", () => {
  assert.deepEqual(reviews.reviewModerationData({ featured: true }), { featured: true, status: "approved" });
  assert.deepEqual(reviews.reviewModerationData({ featured: false }), { featured: false });
  assert.deepEqual(reviews.reviewModerationData({ status: "rejected" }), { status: "rejected" });
  assert.equal(reviews.isReviewStatus("pending"), true);
  assert.equal(reviews.isReviewStatus("deleted"), false);
});

test("who can be asked how: email needs an address, SMS and WhatsApp a phone, a link always works", () => {
  assert.deepEqual(reviews.requestReach({ buyerEmail: "ada@x.ng", buyerPhone: null }), { email: true, sms: false, whatsapp: false, link: true });
  assert.deepEqual(reviews.requestReach({ buyerEmail: "no-at-sign", buyerPhone: "0803" }), { email: false, sms: true, whatsapp: true, link: true });
});

test("review routes: seller only, validated, and the web's actions use the same lib", () => {
  const patch = read("src/app/api/app/reviews/[key]/route.ts");
  assert.match(patch, /export const PATCH = withSeller/);
  assert.match(patch, /z\.union\(\[z\.object\(\{ status: z\.enum\(REVIEW_STATUSES\) \}\)\.strict\(\), z\.object\(\{ featured: z\.boolean\(\) \}\)\.strict\(\)\]\)/);
  assert.match(patch, /parseReviewKey\(key\)/);
  assert.match(patch, /moderateReview\(store\.id, ref, parsed\.data\)/);
  const actions = read("src/app/actions/reviews.ts");
  assert.match(actions, /moderateReview\(store\.id, ref, \{ status \}\)/);
  assert.match(actions, /moderateReview\(store\.id, ref, \{ featured: formData\.get\("featured"\) === "1" \}\)/);
  assert.doesNotMatch(actions, /data: \{ featured: true, status: "approved"/, "the featuring rule lives in one place");
  assert.match(read("src/lib/reviews/server.ts"), /where: \{ id: ref\.id, storeId \}/, "scoped to the seller's store");

  const requests = read("src/app/api/app/reviews/requests/route.ts");
  assert.match(requests, /export const GET = withSeller/);
  assert.match(requests, /export const POST = withSeller/);
  assert.match(requests, /channel: z\.enum\(REQUEST_CHANNELS\)/);
  assert.match(requests, /orderIds: z\.array\(z\.string\(\)\.min\(1\)\.max\(64\)\)\.min\(1, "Choose at least one order\."\)\.max\(200\)/);
  assert.match(requests, /requestReviews\(\{ storeId: store\.id, orderIds: parsed\.data\.orderIds, channel: parsed\.data\.channel, trigger: "manual"/);
  assert.match(read("src/app/home/reviews/request/page.tsx"), /requestableOrders\(store\.id\)/, "the web page lists the same orders");
});

test("Ask for reviews in the app: the web form's choices", () => {
  const orders = [
    { id: "a", reach: { email: true, sms: true, whatsapp: true, link: true }, asked: null, reviewed: false },
    { id: "b", reach: { email: false, sms: true, whatsapp: true, link: true }, asked: null, reviewed: false },
    { id: "c", reach: { email: true, sms: false, whatsapp: false, link: true }, asked: { channel: "email", at: "2026-10-01" }, reviewed: false },
    { id: "d", reach: { email: true, sms: false, whatsapp: false, link: true }, asked: null, reviewed: true },
  ];
  assert.equal(ask.defaultChannel({ email: true }), "email");
  assert.equal(ask.defaultChannel({ email: false, sms: true }), "link");
  assert.equal(ask.channelReady({ sms: false }, "sms"), false);
  assert.equal(ask.channelReady({}, "link"), true);
  assert.deepEqual(ask.visibleOrders(orders, false).map((o) => o.id), ["a", "b"]);
  assert.deepEqual(ask.visibleOrders(orders, true).map((o) => o.id), ["a", "b", "c", "d"]);
  assert.deepEqual(ask.chooseAll(ask.visibleOrders(orders, false), "email"), ["a"]);
  assert.deepEqual(ask.keepReachable(["a", "b"], orders, "email"), ["a"]);
  assert.deepEqual(ask.keepReachable(["a", "b"], orders, "link"), ["a", "b"]);
});

// ─── Legal pages as plain text ──────────────────────────────────────────────

const CTX = { storeName: "Ada Bags", city: "Lagos", country: "Nigeria", email: "ada@x.ng", phone: "0803 000 0000", delivery: [{ name: "Lagos", fee: 1500, freeOver: null, estimatedDays: "1-2" }], payOnDelivery: true, paymentLabels: ["Card"] };

test("a page's text reads back as the same document (headings, lists, tables, bold, links)", () => {
  for (const { key } of legal.STANDARD_LEGAL_PAGES) {
    const full = legal.legalTemplate(key, CTX);
    // The template's first block is a review note (a callout), which plain text keeps as a quote.
    const body = { type: "doc", content: full.content.slice(1) };
    const back = legal.legacyTextToDoc(md.docToMarkdown(body));
    assert.deepEqual(back, body, key);
  }
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "See " }, { type: "text", text: "terms", marks: [{ type: "link", attrs: { href: "https://x.ng/t" } }, { type: "bold" }] }] }] };
  assert.equal(md.docToMarkdown(doc), "See [**terms**](https://x.ng/t)");
});

test("plain-text saves keep the stored document unless the words changed, and refuse to drop videos and buttons", () => {
  const stored = legal.legalTemplate("refund-policy", CTX);
  const { text, textEditable } = legal.legalPageText(stored);
  assert.equal(textEditable, true, "a template (with its note) is editable as text");
  assert.equal(legal.docFromEditedText(stored, undefined).doc, stored, "publish/unpublish only");
  assert.equal(legal.docFromEditedText(stored, `${text}\n`).doc, stored, "unchanged words keep the callout and every mark");
  const edited = legal.docFromEditedText(stored, "# Returns\n\nWe take returns within 7 days.");
  assert.equal(edited.doc.content[0].type, "heading");
  assert.equal(edited.doc.content[1].content[0].text, "We take returns within 7 days.");

  const rich = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Watch" }] }, { type: "youtube", attrs: { src: "https://www.youtube-nocookie.com/embed/x" } }] };
  assert.equal(legal.legalPageText(rich).textEditable, false);
  assert.ok("error" in legal.docFromEditedText(rich, "Watch this"));
  assert.equal(legal.docFromEditedText(rich, undefined).doc, rich, "but it can still be published or unpublished");
});

test("legal text route: seller only, saved through saveLegalPage (title, empty and size rules), Peggy's draft as text", () => {
  const route = read("src/app/api/app/legal/[key]/text/route.ts");
  assert.match(route, /export const GET = withSeller/);
  assert.match(route, /export const PUT = withSeller/);
  assert.match(route, /docFromEditedText\(page\.doc, input\.text\)/);
  assert.match(route, /saveLegalPage\(store, page\.key, \{ title: input\.title, doc: next\.doc, style: page\.style, seo: page\.seo, published: input\.published \}\)/, "style and SEO are kept");
  assert.match(read("src/lib/legal/server.ts"), /if \(page\.published && legalPageStatus\(page\) === "empty"\) throw new LegalError/, "the publish rule the route relies on");
  assert.match(read("src/app/api/app/legal/[key]/draft/route.ts"), /text: legalPageText\(draft\.doc\)\.text/);
});

// ─── Subscribers ────────────────────────────────────────────────────────────

test("subscribers: the app's list is the web page's list, and adding sends the web's body", () => {
  const route = read("src/app/api/app/marketing/subscribers/route.ts");
  assert.match(route, /export const GET = marketingRoute/);
  assert.match(route, /listSubscribers\(store\.id, parsed\.data\)/);
  assert.match(route, /status: z\.enum\(\["active", "unsubscribed", "bounced", "spam"\]\)/);
  assert.match(read("src/app/home/marketing/subscribers/page.tsx"), /listSubscribers\(store\.id, \{ q: params\.q, status, source, tag: params\.tag/);
  const lib = read("src/lib/marketing/subscribers.ts");
  assert.match(lib, /where: Prisma\.SubscriberWhereInput = \{\s*storeId,/, "scoped to the shop");
  const app = read("apps/mobile/src/lib/marketing.ts");
  assert.match(app, /consent: \{ email: form\.emailOk, sms: form\.textOk, whatsapp: form\.textOk, note: form\.note\.trim\(\) \|\| undefined \}/);
  assert.match(read("apps/mobile/src/app/marketing/subscribers.tsx"), /disabled=\{!form\.emailOk \|\| !form\.email\.trim\(\)\}/, "only people who agreed, like the web");
});

// ─── The screens are in the app now ─────────────────────────────────────────

test("these screens no longer open the website for what they do natively", () => {
  const mobile = (path) => read(`apps/mobile/src/app/${path}`);
  assert.doesNotMatch(mobile("reviews/ask.tsx"), /openWeb\(/);
  assert.doesNotMatch(mobile("legal.tsx"), /openWeb\(`\/home\/legal\/\$\{/);
  assert.match(mobile("legal.tsx"), /pathname: "\/legal\/\[key\]"/);
  assert.match(mobile("marketing/index.tsx"), /router\.push\("\/marketing\/subscribers"\)/);
  assert.match(mobile("channels.tsx"), /connectChannel\(platform\)/);
  assert.match(read("apps/mobile/src/lib/channels.ts"), /WebBrowser\.openAuthSessionAsync\(/);
  for (const screen of ["channels.tsx", "legal/[key].tsx", "marketing/subscribers.tsx", "reviews/ask.tsx", "reviews/[key].tsx"]) {
    assert.match(mobile(screen), /useT\("m_/, `${screen} uses the app's words`);
  }
});
