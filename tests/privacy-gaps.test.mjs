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
