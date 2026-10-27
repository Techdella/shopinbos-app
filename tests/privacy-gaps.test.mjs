// Data protection gaps closed in one go: review requests honour opt-outs and say how to stop, Shopinbos's WhatsApp
// tips take START as well as STOP, fonts never load from Google in the browser or in email, analytics and session
// replay wait for consent. Pure helpers are imported; wiring is checked in the source.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("review request texts always say how to stop, within the length limit", async () => {
  const { withOptOut, reviewRequestMessage } = await import("../src/lib/reviews/pure.ts");
  const message = reviewRequestMessage({ storeName: "Ada Styles", customerName: "Chioma Obi", link: `https://app.shopinbos.com/s/ada/review/${"x".repeat(60)}` });
  const reply = withOptOut(message.sms, { reply: true });
  assert.ok(reply.endsWith("Reply STOP to opt out.") && reply.length <= 300);
  const linked = withOptOut("y".repeat(400), { link: "https://app.shopinbos.com/s/ada/review/abc/stop" });
  assert.ok(linked.endsWith("Stop texts: https://app.shopinbos.com/s/ada/review/abc/stop") && linked.length === 300);

  const requests = read("src/lib/reviews/requests.ts");
  assert.match(requests, /contactAllows\(/, "unsubscribed contacts get no review email");
  assert.match(requests, /isOptedOut\(optOuts/, "STOP numbers get no review text");
  assert.match(requests, /unsubscribeHeaders\(links\)/, "review emails carry List-Unsubscribe");
  assert.match(read("src/app/s/[slug]/review/[token]/stop/page.tsx"), /recordOptOut\(/);
});

test("Shopinbos WhatsApp: STOP and START both work, and the preference page has the switch", async () => {
  const { isStartWord, isStopWord } = await import("../src/lib/member-messaging/tips-email.ts");
  assert.ok(isStartWord("START") && isStartWord(" start. ") && !isStartWord("start my shop"));
  assert.ok(isStopWord("STOP") && !isStartWord("STOP"));
  assert.match(read("src/app/api/webhooks/whatsapp/route.ts"), /startWhatsAppTips\(/);
  assert.match(read("src/app/email/preferences/[token]/page.tsx"), /setWhatsAppMarketing\(/);
});

test("fonts: emails and the brand book never call Google from the reader's device", async () => {
  const { rewriteFontCss, safeFamily, safeFontPath } = await import("../src/lib/google-fonts-proxy.ts");
  assert.equal(rewriteFontCss("src: url(https://fonts.gstatic.com/s/inter/v13/abc.woff2) format('woff2');"), "src: url(/api/fonts/file/s/inter/v13/abc.woff2) format('woff2');");
  assert.equal(safeFamily("Playfair Display:wght@500;700"), "Playfair Display:wght@500;700");
  assert.equal(safeFamily("x</style><script>"), null);
  assert.equal(safeFontPath(["s", "inter", "v13", "abc.woff2"]), "s/inter/v13/abc.woff2");
  assert.equal(safeFontPath(["..", "etc", "passwd"]), null);
  assert.equal(safeFontPath(["s", "inter", "v13", "x.html"]), null);

  assert.doesNotMatch(read("src/lib/email/shell.ts"), /fonts\.googleapis\.com/);
  for (const file of fs.readdirSync(path.join(ROOT, "docs/email/supabase")).filter((name) => name.endsWith(".html"))) {
    assert.doesNotMatch(read(`docs/email/supabase/${file}`), /fonts\.googleapis\.com/, file);
  }
  assert.doesNotMatch(read("src/app/home/brand-kit/book/page.tsx"), /fonts\.googleapis\.com/);
  assert.match(read("public/fonts/email.css"), /@font-face/);
});

test("analytics and session replay start only after consent, masked", () => {
  const analytics = read("src/components/analytics/ProductAnalytics.tsx");
  assert.match(analytics, /consent !== "analytics"\) return/);
  assert.match(analytics, /disable_session_recording: true/);
  const client = read("src/instrumentation-client.ts");
  assert.doesNotMatch(client, /replayIntegration\(/, "no replay before consent");
  const replay = read("src/lib/analytics/replay.ts");
  assert.match(replay, /maskAllText: true, maskAllInputs: true, blockAllMedia: true/);
});

test("accounts are for adults: sign-up asks, the ID check confirms from the date of birth", async () => {
  const { ageOn, isAdult } = await import("../src/lib/auth/age.ts");
  const now = new Date("2026-10-27T12:00:00Z");
  assert.equal(ageOn("2008-10-27", now), 18);
  assert.equal(ageOn("2008-10-28", now), 17, "the day before the 18th birthday");
  assert.ok(isAdult("1990-01-01", now) && !isAdult("2010-05-05", now) && !isAdult("not a date", now));
  assert.match(read("src/components/auth/app/AppAuth.tsx"), /ageConfirmed: needsAge && adult/);
  assert.match(read("apps/mobile/src/components/AuthForm.tsx"), /ageMissing\(\)/);
  assert.match(read("src/app/api/auth/sync-user/route.ts"), /recordAgeConfirmed\(/);
  assert.match(read("src/lib/wallet/identity.server.ts"), /isAdult\(/);
  assert.match(read("docs/data-protection/lawful-basis.md"), /NDPA s\.25/);
});

test("18+ is recorded for every way in: Google from a sign-up page, and a one-time check for anyone else", async () => {
  assert.match(read("src/components/auth/app/auth-api.ts"), /url\.searchParams\.set\("adult", "1"\)/);
  assert.match(read("src/app/auth/callback/route.ts"), /get\("adult"\) === "1"[\s\S]*recordAgeConfirmed\(/);
  assert.match(read("src/app/api/auth/activity/route.ts"), /ageConfirmed:/);
  assert.match(read("src/app/api/auth/age/route.ts"), /recordAgeConfirmed\(user\.staff\?\.userId \?\? user\.id\)/);
  assert.match(read("src/components/auth/IdleSignOut.tsx"), /<AgeCheck /);
  assert.match(read("apps/mobile/src/components/SessionGuard.tsx"), /\/api\/auth\/age/);
});

test("store templates: every Google Fonts stylesheet goes through the app's proxy, and the CSP drops Google", async () => {
  const { googleFontsUpstream, selfHostGoogleFonts } = await import("../src/lib/google-fonts-proxy.ts");
  const q = (text) => new URLSearchParams(text);
  assert.equal(googleFontsUpstream("css", q("family=Open+Sans:300,400|PT+Sans+Narrow&subset=all"))?.toString(), "https://fonts.googleapis.com/css?family=Open+Sans%3A300%2C400%7CPT+Sans+Narrow&subset=all");
  assert.ok(googleFontsUpstream("css2", q("family=Inter:wght@400;700&display=swap")));
  assert.ok(googleFontsUpstream("icon", q("family=Material+Icons")));
  assert.equal(googleFontsUpstream("evil", q("family=Inter")), null);
  assert.equal(googleFontsUpstream("css", q("family=Inter&callback=x")), null, "only font parameters");
  assert.equal(googleFontsUpstream("css", q("family=<script>")), null);
  assert.equal(googleFontsUpstream("css", q("display=swap")), null, "needs a family");
  const html = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">';
  assert.equal(selfHostGoogleFonts(html), '<link href="/api/fonts/google/css2?family=Inter&display=swap" rel="stylesheet">');
  assert.equal(selfHostGoogleFonts("@import url(//fonts.googleapis.com/css?family=Lato);"), "@import url(/api/fonts/google/css?family=Lato);");

  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (entry.name === ".sass-cache" ? [] : walk(path.join(dir, entry.name))) : [path.join(dir, entry.name)]));
  const calling = walk(path.join(ROOT, "public/store-templates")).filter((file) => /\.(html?|css|scss|less)$/i.test(file) && /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(calling, [], "run node scripts/self-host-template-fonts.mjs");
  const csp = read("next.config.ts");
  assert.doesNotMatch(csp, /"style-src[^"]*fonts\.googleapis\.com/);
  assert.doesNotMatch(csp, /"font-src[^"]*fonts\.gstatic\.com/);
  assert.match(read("src/lib/storefront/host-routing.ts"), /"\/api\/fonts"/);
});
