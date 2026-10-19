// Email as an inbox channel: which way to connect we recommend (domain bought on Shopinbos, own domain, free
// address), the DNS records a sending domain needs, encrypted Gmail tokens, the reply address that threads answers
// back into their conversation, the Gmail sign-in state and PKCE, Gmail messages, and the wiring (no mailto: to
// customers in seller screens, seller-only routes, the cron job). Pure TypeScript, Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const e = await import("../src/lib/email-channel/pure.ts");
const crypto = await import("../src/lib/inbox/crypto.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("recommendation: a domain bought on Shopinbos is one click, Gmail is the other choice", () => {
  const r = e.recommendEmailSetup({ customDomain: "www.AdasCloset.com", boughtDomains: ["adascloset.com"] });
  assert.deepEqual(r, { kind: "bought", domain: "adascloset.com", primary: "domain_auto", options: ["domain_auto", "gmail"] });
  // The purchase may be stored with www too.
  assert.equal(e.recommendEmailSetup({ customDomain: "adascloset.com", boughtDomains: ["www.adascloset.com"] }).kind, "bought");
});

test("recommendation: a domain bought elsewhere gets DNS steps first, and Gmail is offered too", () => {
  const r = e.recommendEmailSetup({ customDomain: "shop.mama-tobi.ng", boughtDomains: ["another.com", null] });
  assert.deepEqual(r, { kind: "custom", domain: "shop.mama-tobi.ng", primary: "domain_dns", options: ["domain_dns", "gmail"] });
});

test("recommendation: a free Shopinbos address gets Gmail, and a nudge to buy a domain", () => {
  const expected = { kind: "free", domain: null, primary: "gmail", options: ["gmail", "buy_domain"] };
  assert.deepEqual(e.recommendEmailSetup({ customDomain: null }), expected);
  assert.deepEqual(e.recommendEmailSetup({ customDomain: "" }), expected);
  assert.deepEqual(e.recommendEmailSetup({ customDomain: "adas.mybos.store", platformDomains: ["mybos.store"] }), expected);
  assert.deepEqual(e.recommendEmailSetup({ customDomain: "not a domain" }), expected);
});

test("the address prefix and the from-name are cleaned", () => {
  assert.equal(e.cleanPrefix(" Hello "), "hello");
  assert.equal(e.cleanPrefix("sales.team"), "sales.team");
  for (const bad of ["", "a b", "-x", "x-", "a..b", "hello@x", "é", "x".repeat(33)]) assert.equal(e.cleanPrefix(bad), null, bad);
  assert.equal(e.cleanFromName('Ada "The" <Closet>\r\nBcc: x'), "Ada The Closet Bcc: x");
  assert.equal(e.cleanFromName("   ", "Ada's Closet"), "Ada's Closet");
  assert.equal(e.formatFrom("Ada's Closet", "hello@adas.com"), '"Ada\'s Closet" <hello@adas.com>');
});

const RESEND_RECORDS = [
  { record: "SPF", name: "send", type: "MX", ttl: "Auto", status: "verified", value: "feedback-smtp.us-east-1.amazonses.com", priority: 10 },
  { record: "SPF", name: "send.adascloset.com", type: "TXT", ttl: "Auto", status: "pending", value: '"v=spf1 include:amazonses.com ~all"' },
  { record: "DKIM", name: "resend._domainkey", type: "TXT", ttl: "Auto", status: "verified", value: "p=MIGfMA0GCSqGSIb3DQEB" },
  { record: "Receiving", name: "adascloset.com", type: "MX", ttl: "Auto", status: "pending", value: "inbound-smtp.us-east-1.amazonaws.com", priority: 9 },
  { record: "Tracking", name: "links", type: "CNAME", ttl: "Auto", status: "pending", value: "track.resend.com" },
];

test("DNS records: Resend's sending records plus DMARC, relative names, receiving only when asked", () => {
  const records = e.buildEmailDnsRecords("adascloset.com", RESEND_RECORDS);
  assert.deepEqual(records.map((r) => [r.purpose, r.type, r.name]), [
    ["spf", "MX", "send"],
    ["spf", "TXT", "send"],
    ["dkim", "TXT", "resend._domainkey"],
    ["dmarc", "TXT", "_dmarc"],
  ]);
  assert.equal(records[0].priority, 10);
  assert.equal(records[1].priority, null);
  assert.equal(records[1].fqdn, "send.adascloset.com");
  assert.equal(records[3].value, "v=DMARC1; p=none;");
  assert.equal(records[3].status, "pending");

  const receiving = e.buildEmailDnsRecords("adascloset.com", RESEND_RECORDS, { receiving: true, dmarcStatus: "verified" });
  const mx = receiving.find((r) => r.purpose === "receiving");
  assert.deepEqual([mx.name, mx.fqdn, mx.priority], ["@", "adascloset.com", 9]);
  assert.equal(receiving.find((r) => r.purpose === "dmarc").status, "verified");
  assert.equal(e.buildEmailDnsRecords("adascloset.com", RESEND_RECORDS, { dmarc: false }).some((r) => r.purpose === "dmarc"), false);

  assert.equal(e.relativeHost("@", "a.com"), "@");
  assert.equal(e.relativeHost("A.COM.", "a.com"), "@");
  assert.equal(e.relativeHost("x.y.a.com", "a.com"), "x.y");
});

test("DNS records: sending works once SPF and DKIM pass; Vercel bodies; nothing added twice", () => {
  const records = e.buildEmailDnsRecords("adascloset.com", RESEND_RECORDS);
  assert.equal(e.sendingVerified(records), false, "one SPF record is still pending");
  const allGood = e.buildEmailDnsRecords("adascloset.com", RESEND_RECORDS.map((r) => ({ ...r, status: "verified" })));
  assert.equal(e.sendingVerified(allGood), true, "DMARC doesn't block sending");
  assert.equal(e.sendingVerified([]), false);

  assert.deepEqual(e.vercelRecordBody(records[0]), { name: "send", type: "MX", value: "feedback-smtp.us-east-1.amazonses.com", ttl: 60, mxPriority: 10 });
  assert.deepEqual(e.vercelRecordBody({ ...records[2], name: "@" }), { name: "", type: "TXT", value: "p=MIGfMA0GCSqGSIb3DQEB", ttl: 60 });

  const zone = [
    { name: "", type: "MX", value: "aspmx.l.google.com" },
    { name: "send", type: "TXT", value: "v=spf1 include:amazonses.com ~all" },
    { name: "_dmarc", type: "TXT", value: "v=DMARC1; p=quarantine" },
  ];
  assert.equal(e.recordPresent(records[1], zone), true, "quotes don't matter");
  assert.equal(e.recordPresent(records[2], zone), false);
  assert.equal(e.hasDmarc(zone), true);
  assert.equal(e.hasApexMx(zone), true, "the seller already gets mail at the domain: we never take it over");
  assert.equal(e.hasApexMx(zone.slice(1)), false);
});

test("Gmail tokens are encrypted at rest and only open with the same key", () => {
  const key = randomBytes(32);
  const tokens = { refreshToken: "1//0gRefresh", accessToken: "ya29.access", expiresAt: 1760000000000 };
  const sealed = crypto.encryptJson(tokens, key);
  assert.doesNotMatch(sealed, /Refresh|ya29/);
  assert.notEqual(crypto.encryptJson(tokens, key), sealed, "a fresh IV every time");
  assert.deepEqual(crypto.decryptJson(sealed, key), tokens);
  assert.equal(crypto.decryptJson(sealed, randomBytes(32)), null, "another key can't open it");
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.equal(crypto.decryptJson(parts.join(":"), key), null, "tampering is detected");
  assert.throws(() => crypto.encryptJson(tokens, null), /INBOX_ENCRYPTION_KEY/);
});

test("reply address: encodes the conversation, signed, and decodes back", () => {
  const address = e.encodeReplyAddress("adas-closet", "cmabc123def456", "inbox.shopinbos.com", "s3cret");
  assert.match(address, /^adas-closet\+r-cmabc123def456-[0-9a-f]{12}@inbox\.shopinbos\.com$/);
  assert.deepEqual(e.decodeReplyAddress(address, "inbox.shopinbos.com", "s3cret"), { slug: "adas-closet", conversationId: "cmabc123def456" });
  assert.deepEqual(e.decodeReplyAddress(address.toUpperCase(), "INBOX.shopinbos.com", "s3cret"), { slug: "adas-closet", conversationId: "cmabc123def456" }, "mail servers may change case");
  // A changed conversation id or signature keeps the store but not the thread.
  assert.deepEqual(e.decodeReplyAddress(address.replace("cmabc123def456", "cmzzz999zzz999"), "inbox.shopinbos.com", "s3cret"), { slug: "adas-closet", conversationId: null });
  assert.deepEqual(e.decodeReplyAddress(address, "inbox.shopinbos.com", "other"), { slug: "adas-closet", conversationId: null });
  assert.deepEqual(e.decodeReplyAddress("adas-closet@inbox.shopinbos.com", "inbox.shopinbos.com", "s3cret"), { slug: "adas-closet", conversationId: null });
  assert.equal(e.decodeReplyAddress(address, "other.com", "s3cret"), null);
  assert.equal(e.decodeReplyAddress(address, null, "s3cret"), null);
  // Without a secret (or an odd id) the plain inbox address is used.
  assert.equal(e.encodeReplyAddress("adas-closet", "cmabc123def456", "inbox.shopinbos.com", ""), "adas-closet@inbox.shopinbos.com");
  assert.equal(e.encodeReplyAddress("adas-closet", "bad id!", "inbox.shopinbos.com", "s3cret"), "adas-closet@inbox.shopinbos.com");
  // The webhook's existing slug reader still finds the store in a tagged address.
  return import("../src/lib/inbox/pure.ts").then((inbox) => assert.equal(inbox.storeSlugFromAddress([address], "inbox.shopinbos.com"), "adas-closet"));
});

test("Gmail sign-in: PKCE S256 and a signed, fresh, same-browser state", () => {
  // S256: base64url(sha256(verifier)), no padding.
  assert.equal(e.pkceChallenge("verifier-123"), createHash("sha256").update("verifier-123").digest("base64url"));
  assert.match(e.pkceChallenge("verifier-123"), /^[A-Za-z0-9_-]{43}$/);
  const pair = e.pkcePair();
  assert.equal(e.pkceChallenge(pair.verifier), pair.challenge);
  assert.ok(pair.verifier.length >= 43);

  const key = randomBytes(32);
  const now = Date.parse("2026-10-15T10:00:00Z");
  const state = e.signGmailState({ storeId: "store_1", nonce: "nonce-abc", iat: now }, key);
  const ok = (overrides = {}) => e.checkGmailState(overrides.state ?? state, { storeId: "store_1", nonceCookie: "nonce-abc", ...overrides }, overrides.key ?? key, overrides.now ?? now + 60_000);
  assert.equal(ok(), true);
  assert.equal(ok({ storeId: "store_2" }), false, "another store");
  assert.equal(ok({ nonceCookie: "nonce-xyz" }), false, "another browser");
  assert.equal(ok({ nonceCookie: null }), false);
  assert.equal(ok({ key: randomBytes(32) }), false, "not signed by us");
  assert.equal(ok({ now: now + 16 * 60_000 }), false, "too old");
  assert.equal(ok({ state: `${state}x` }), false);
  assert.equal(ok({ state: "" }), false);

  const url = new URL(e.gmailAuthUrl({ clientId: "cid", redirectUri: "https://app.shopinbos.com/api/app/inbox/email/gmail/callback", state, challenge: pair.challenge }));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.deepEqual(url.searchParams.get("scope").split(" "), ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]);
});

test("Gmail messages: built as MIME with safe headers, and read back", () => {
  const raw = e.buildMimeMessage({ fromName: "Ìyá Àdùkẹ́ Stores", fromAddress: "ade@gmail.com", to: "ada@example.com", subject: "Your order\r\nBcc: evil@x.com", text: "Ẹ ṣé o!", html: "<p>Ẹ ṣé o!</p>", inReplyTo: "<m1@mail.gmail.com>", boundary: "b1" });
  assert.match(raw, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <ade@gmail\.com>\r\n/);
  assert.match(raw, /\r\nSubject: Your order Bcc: evil@x\.com\r\n/, "no header injection");
  assert.doesNotMatch(raw, /\r\nBcc:/);
  assert.match(raw, /\r\nIn-Reply-To: <m1@mail\.gmail\.com>\r\nReferences: <m1@mail\.gmail\.com>\r\n/);
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="b1"/);
  assert.equal(Buffer.from(e.base64UrlEncode(raw), "base64url").toString("utf8"), raw);

  const message = e.readGmailMessage({
    id: "18f1",
    threadId: "18f0",
    labelIds: ["INBOX", "UNREAD"],
    internalDate: "1760522400000",
    payload: {
      mimeType: "multipart/mixed",
      headers: [{ name: "From", value: "Ada Obi <Ada@Example.com>" }, { name: "Subject", value: "Re: Your order" }, { name: "Message-ID", value: "<r1@example.com>" }, { name: "To", value: "ade@gmail.com" }],
      parts: [
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Yes please!").toString("base64url") } }, { mimeType: "text/html", body: { data: Buffer.from("<b>Yes please!</b>").toString("base64url") } }] },
        { mimeType: "image/jpeg", filename: "receipt.jpg", body: { attachmentId: "a1" } },
      ],
    },
  });
  assert.equal(message.text, "Yes please!");
  assert.equal(message.html, "<b>Yes please!</b>");
  assert.equal(message.messageIdHeader, "<r1@example.com>");
  assert.equal(message.createdAt.toISOString(), "2025-10-15T10:00:00.000Z");
  assert.deepEqual(message.attachments, [{ name: "receipt.jpg", contentType: "image/jpeg" }]);
  assert.equal(e.addressOf(message.from), "ada@example.com");
  assert.equal(e.addressOf("not an address"), null);
  assert.equal(e.readGmailMessage({ id: "x" }), null);
});

test("no mailto: to customers in seller screens; email opens the in-app composer", () => {
  const drawer = read("src/app/home/customers/CustomerDrawer.tsx");
  assert.doesNotMatch(drawer, /mailto:/);
  assert.match(drawer, /onClick=\{writeEmail\}/);
  assert.match(drawer, /compose/);
  assert.doesNotMatch(read("src/app/home/orders/[id]/page.tsx"), /mailto:/);
  assert.match(read("src/app/home/orders/[id]/page.tsx"), /compose=email/);
  assert.doesNotMatch(read("src/app/home/forms/page.tsx"), /mailto:/);
  // The drawer won't send email until it's connected; it shows the recommended way to connect instead.
  const server = read("src/lib/customers/drawer.server.ts");
  assert.match(server, /EMAIL_NOT_CONNECTED/);
  assert.match(server, /resolveEmailSender\(/);
});

test("wiring: seller-only routes with zod, the cron job, rate limits, and email through the connected sender", () => {
  for (const file of ["src/app/api/app/inbox/email/route.ts", "src/app/api/app/inbox/email/domain/route.ts"]) {
    const src = read(file);
    assert.match(src, /withSeller\(/, file);
    assert.match(src, /from "zod"/, file);
    assert.match(src, /sellerEmailStore\(user\.id\)/, file);
  }
  assert.match(read("src/lib/email-channel/http.server.ts"), /where: \{ userId \}/);
  for (const file of ["src/app/api/app/inbox/email/gmail/connect/route.ts", "src/app/api/app/inbox/email/gmail/callback/route.ts"]) {
    const src = read(file);
    assert.match(src, /withSeller\(/, file);
    assert.match(src, /GMAIL_NONCE_COOKIE/, file);
    assert.match(src, /GMAIL_PKCE_COOKIE/, file);
  }
  assert.match(read("src/app/api/app/inbox/email/gmail/callback/route.ts"), /checkGmailState\(/);
  const cron = read("src/app/api/cron/gmail-sync/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/, "the cron secret or a signed QStash call");
  const sql = read("docs/migrations/2026-10-31-email-channel.sql");
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'gmail-sync'\)/);
  assert.match(sql, /'\*\/5 \* \* \* \*'/);
  assert.match(sql, /\/api\/cron\/gmail-sync/);
  assert.match(read("src/app/api/app/inbox/conversations/[id]/messages/route.ts"), /checkRateLimitShared\(/);
  // Every inbox email goes through the store's connected sender, with the threading reply address.
  const channel = read("src/lib/inbox/channels/email.ts");
  assert.match(channel, /resolveEmailSender\(/);
  assert.match(channel, /sendGmailEmail\(/);
  assert.match(channel, /encodeReplyAddress\(/);
  assert.match(read("src/app/api/webhooks/email/route.ts"), /decodeReplyAddress\(/);
  // Tokens never go to the browser: the setup view has no credentials.
  const view = read("src/lib/email-channel/server.ts");
  const viewBody = view.slice(view.indexOf("export async function emailSetupView"), view.indexOf("// ─── Own domain"));
  assert.doesNotMatch(viewBody, /credentials|refreshToken|accessToken/);
  // Gmail sync never imports the whole mailbox.
  const gmail = read("src/lib/email-channel/gmail.server.ts");
  assert.match(gmail, /appThreads\.has\(/);
  assert.match(gmail, /knownCustomer\(/);
  assert.match(gmail, /oauth2\.googleapis\.com\/revoke/);
});
