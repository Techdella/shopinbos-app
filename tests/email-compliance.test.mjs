// Email compliance: every email carries a logo, light/dark support and a footer with the sender's business details;
// marketing and lifecycle mail also carry Unsubscribe + Update preferences links and RFC 8058 List-Unsubscribe
// headers. Pure builders are rendered here; server senders are checked at the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";

const shell = await import("../src/lib/email/shell.ts");
const tokens = await import("../src/lib/email/tokens.ts");
const prefs = await import("../src/lib/email/preferences.ts");
const storeEmails = await import("../src/lib/email/store-emails.ts");
const layout = await import("../src/lib/marketing/email-layout.ts");
const preview = await import("../src/lib/marketing/preview.ts");
const library = await import("../src/lib/marketing/template-library.ts");
const reminders = await import("../src/lib/verification/reminders.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const APP = "https://app.example";
const LEGAL = { name: shell.SHOPINBOS_LEGAL_DEFAULTS.name, address: shell.SHOPINBOS_LEGAL_DEFAULTS.address };
const STORE = {
  name: "Ada & <Co>",
  legalName: "Ada Fabrics Ltd",
  logoUrl: "https://cdn.example/ada.png",
  address: "12 Allen Avenue, Ikeja, Lagos, Nigeria",
  websiteUrl: "https://ada.shopinbos.shop",
  contactUrl: "mailto:hello@ada.ng",
  privacyUrl: "https://ada.shopinbos.shop/policies/privacy-policy",
  accent: "#E86A4F",
};

function assertShell(html, label) {
  assert.match(html, /<meta name="color-scheme" content="(light dark|dark)"/, `${label}: color-scheme meta`);
  assert.match(html, /<meta name="supported-color-schemes" content="(light dark|dark)"/, `${label}: supported-color-schemes meta`);
  assert.match(html, /@media \(prefers-color-scheme:dark\)/, `${label}: dark-mode media query`);
  assert.match(html, /\[data-ogsc\]/, `${label}: Outlook.com dark text selector`);
  assert.match(html, /\[data-ogsb\]/, `${label}: Outlook.com dark background selector`);
  assert.match(html, /max-width:600px/, `${label}: 600px layout`);
  assert.match(html, /role="presentation"/, `${label}: table layout`);
}

function assertPlatformLogo(html, label) {
  assert.match(html, new RegExp(`<img src="${APP}/brand/email/shopinbos-logo-navy@2x\\.png" width="210" height="20" alt="Shopinbos"`), `${label}: light logo with size and alt`);
  assert.match(html, new RegExp(`<img src="${APP}/brand/email/shopinbos-logo-white@2x\\.png" width="210" height="20" alt="Shopinbos"`), `${label}: dark logo`);
  assert.match(html, /class="sib-logo-dark" style="display:none/, `${label}: dark logo hidden by default (light fallback)`);
  assert.match(html, /\.sib-logo-light\{display:none!important\}/, `${label}: light logo hidden in dark mode`);
}

function assertMarketingFooter(html, label) {
  assert.match(html, /class="sib-foot-link sib-unsubscribe"[^>]*>Unsubscribe</, `${label}: Unsubscribe link`);
  assert.match(html, /class="sib-foot-link sib-preferences"[^>]*>Update preferences</, `${label}: Update preferences link`);
}

test("the email logos exist at retina size", () => {
  for (const file of ["shopinbos-logo-navy@2x.png", "shopinbos-logo-white@2x.png"]) {
    const png = readFileSync(new URL(`../public/brand/email/${file}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 419, `${file} width`);
    assert.equal(png.readUInt32BE(20), 40, `${file} height (2× the 20px it shows at)`);
  }
});

test("platform (A) transactional email: Shopinbos logo, light/dark, legal footer, no unsubscribe", () => {
  const html = shell.platformEmail({ appUrl: APP, kind: "transactional", heading: "Your password was changed", bodyHtml: shell.html.p("It was <you>?"), reason: "this is your Shopinbos account's email address", legal: LEGAL, cta: { label: "Reset", url: `${APP}/forgot-password` } });
  assertShell(html, "security");
  assertPlatformLogo(html, "security");
  assert.match(html, /Shopinbos, a product of Tech Della Solutions LTD \(RC 7038770\)/);
  assert.match(html, /Office 7B, Yemtob Plaza, Elewure, Off Akala Express, Oluyole, Ibadan, Oyo State, Nigeria, 200257/);
  assert.match(html, /This is a service message about your Shopinbos account/);
  assert.match(html, /You&#39;re receiving this because this is your Shopinbos account/);
  assert.match(html, /href="https:\/\/shopinbos\.com\/privacy"[^>]*>Privacy policy/);
  assert.match(html, /href="mailto:support@shopinbos\.com"[^>]*>Contact support/);
  assert.doesNotMatch(html, /sib-unsubscribe/, "transactional mail has no unsubscribe");
  assert.match(html, /It was &lt;you&gt;\?/, "body text is escaped");
  assert.match(html, /border-radius:999px/, "pill button");
});

test("platform (A) lifecycle email: unsubscribe and preferences links", () => {
  const links = tokens.emailLinks(APP, { kind: "user", userId: "user_1" }, "secret");
  const r = reminders.reminderEmail({ index: 0, role: "supplier", firstName: "Ada", businessName: "Ada Fabrics", missing: ["CAC certificate"], link: `${APP}/supplier/verification`, cacEnabled: true });
  const html = shell.platformEmail({ appUrl: APP, kind: "lifecycle", heading: r.heading, bodyHtml: r.bodyHtml, preheader: r.preheader, reason: "you have a Shopinbos supplier account", legal: LEGAL, unsubscribeUrl: links.unsubscribe, preferencesUrl: links.preferences });
  assertShell(html, "lifecycle");
  assertPlatformLogo(html, "lifecycle");
  assertMarketingFooter(html, "lifecycle");
  assert.ok(html.includes(`href="${links.unsubscribe}"`));
  assert.ok(html.includes(`href="${links.preferences}"`));
  assert.match(html, /You&#39;re receiving this because you have a Shopinbos supplier account\./);
  assert.match(html, /Tech Della Solutions LTD/);
  // A notification email links to settings instead.
  const note = shell.platformEmail({ appUrl: APP, kind: "notification", heading: "New order", bodyHtml: "", reason: "you have a Shopinbos seller account", legal: LEGAL, preferencesUrl: `${APP}/home/settings?tab=Notifications` });
  assert.match(note, /Manage email notifications/);
  assert.doesNotMatch(note, /sib-unsubscribe/);
});

test("store (B) order confirmation: store logo, business details, Sent with Shopinbos, service line, no unsubscribe", () => {
  const { subject, html } = storeEmails.orderConfirmationEmail({ appUrl: APP, store: STORE, buyerName: "Bola <b>Ade</b>", orderNumber: "SIB-1", items: [{ name: "Ankara <wrap>", qty: 2, price: "₦20,000" }], total: "₦20,000", orderUrl: "https://ada.shopinbos.shop/order/1" });
  assert.equal(subject, "Order confirmed: SIB-1");
  assertShell(html, "order");
  assert.match(html, /<img class="sib-chip" src="https:\/\/cdn\.example\/ada\.png" height="44" alt="Ada &amp; &lt;Co&gt;"/, "store logo with alt");
  assert.match(html, /Ada Fabrics Ltd/);
  assert.match(html, /12 Allen Avenue, Ikeja, Lagos, Nigeria/);
  assert.match(html, /Sent with/);
  assert.match(html, /shopinbos-logo-navy@2x\.png" width="105" height="10" alt="Shopinbos"/, "small Shopinbos mark");
  assert.match(html, /This is a service message about your order with Ada &amp; &lt;Co&gt;\./);
  assert.match(html, /href="mailto:hello@ada\.ng"/);
  assert.match(html, /policies\/privacy-policy/);
  assert.doesNotMatch(html, /sib-unsubscribe/);
  assert.match(html, /Thank you, Bola!/);
  assert.match(html, /Ankara &lt;wrap&gt; × 2/);
  assert.doesNotMatch(html, /<wrap>|<b>Ade/, "store and buyer text is escaped");
  // No logo: the store name as text, escaped.
  const plain = storeEmails.refundEmail({ appUrl: APP, store: { ...STORE, logoUrl: "http://insecure/logo.png", address: null }, buyerName: "Bola", orderNumber: "SIB-2", amount: "₦5,000", kind: "automatic" }).html;
  assert.match(plain, /class="sib-store-name"[^>]*>Ada &amp; &lt;Co&gt;</);
  assert.doesNotMatch(plain, /insecure/, "only https logos");
  assert.doesNotMatch(plain, /class="sib-address"/, "no address line when the store has none");
  for (const html of [storeEmails.reviewRequestEmail({ appUrl: APP, store: STORE, customerName: "Bola", link: "https://x.example/r", items: ["A"] }), storeEmails.invoiceEmail({ appUrl: APP, store: STORE, invoiceId: "INV-1", description: "<img src=x onerror=alert(1)>", amount: "₦1" }), storeEmails.inboxReplyEmail({ appUrl: APP, store: STORE, body: "Hi\n\nThanks" })]) {
    assertShell(html, "store service email");
    assert.match(html, /Ada Fabrics Ltd/);
    assert.doesNotMatch(html, /<img src=x/);
  }
});

test("marketing (B) campaign: compliance footer, dark mode and List-Unsubscribe headers", () => {
  const links = tokens.emailLinks(APP, { kind: "contact", storeId: "store_1", email: "Ada@Example.com" }, "secret");
  const brand = { storeName: STORE.name, logoUrl: STORE.logoUrl, accent: "#E86A4F", ink: "#111111", paper: "#F6F5F9" };
  const html = layout.wrapEmail({ bodyHtml: "<p>Sale!</p>", brand, preheader: "Big sale", compliance: { appUrl: APP, sender: STORE, kind: "marketing", unsubscribeUrl: `${APP}/email/unsubscribe/tok`, preferencesUrl: links.preferences } });
  assertShell(html, "campaign");
  assertMarketingFooter(html, "campaign");
  assert.match(html, /12 Allen Avenue/);
  assert.match(html, /Sent with/);
  assert.match(html, /Big sale/, "preheader");
  assert.match(html, /You&#39;re receiving this because you subscribed to emails from Ada &amp; &lt;Co&gt; or bought from them\./);
  const headers = shell.listUnsubscribeHeaders(links.oneClick, shell.unsubscribeMailto("unsubscribe@shopinbos.com", links.token));
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(headers["List-Unsubscribe"], /^<https:\/\/app\.example\/api\/email\/unsubscribe\?token=[^>]+>, <mailto:unsubscribe@shopinbos\.com\?subject=unsubscribe%20[^>]+>$/);
  assert.equal(shell.listUnsubscribeHeaders(links.oneClick)["List-Unsubscribe"], `<${links.oneClick}>`, "no mailto unless an inbox is set");
  assert.equal(shell.unsubscribeMailto("not an email", "t"), null);
});

test("all library templates get the logo, dark-mode support and the compliance footer in previews", () => {
  const brand = { storeName: "Ada & Co", logoUrl: null, accent: "#FF6A2B", ink: "#111111", paper: "#F6F5F9" };
  const shop = { name: "Ada & Co", url: "https://ada.shopinbos.shop", appUrl: APP, sender: { address: "12 Allen Avenue, Ikeja", legalName: "Ada Fabrics Ltd" } };
  assert.ok(library.TEMPLATE_LIBRARY.length >= 60, `the ~66 templates (have ${library.TEMPLATE_LIBRARY.length})`);
  for (const tpl of library.TEMPLATE_LIBRARY) {
    const html = preview.renderEmailPreview({ bodyHtml: tpl.bodyHtml, preheader: tpl.preheader, brand, shop });
    assertShell(html, tpl.key);
    assertMarketingFooter(html, tpl.key);
    assert.match(html, /class="sib-store-name"/, `${tpl.key} shows the store name as its logo`);
    assert.match(html, /12 Allen Avenue, Ikeja/, `${tpl.key} shows the business address`);
    assert.match(html, /Ada Fabrics Ltd/, `${tpl.key} shows the business name`);
    assert.match(html, /Sent with/, `${tpl.key} carries the Shopinbos mark`);
  }
  // With no address yet, the preview says so (sending is blocked until there is one).
  const missing = preview.renderEmailPreview({ bodyHtml: "<p>x</p>", brand, shop: { name: "Ada", url: "https://ada.shopinbos.shop" } });
  assert.ok(missing.includes(shell.escapeHtml(preview.ADDRESS_PLACEHOLDER)));
});

test("signed tokens round-trip, reject tampering, and stay compatible with old automation links", () => {
  const secret = "s3cret";
  const contact = tokens.signEmailToken({ kind: "contact", storeId: "store_1", email: " Ada@Example.COM " }, secret);
  assert.deepEqual(tokens.verifyEmailToken(contact, secret), { kind: "contact", storeId: "store_1", email: "ada@example.com" });
  const user = tokens.signEmailToken({ kind: "user", userId: "user_9" }, secret);
  assert.deepEqual(tokens.verifyEmailToken(user, secret), { kind: "user", userId: "user_9" });
  const [payload, sig] = contact.split(".");
  const forged = Buffer.from("store_2\nada@example.com").toString("base64url");
  assert.equal(tokens.verifyEmailToken(`${forged}.${sig}`, secret), null, "a swapped payload fails");
  assert.equal(tokens.verifyEmailToken(`${payload}.${sig.slice(0, -1)}A`, secret), null, "a changed signature fails");
  assert.equal(tokens.verifyEmailToken(contact, "other"), null, "another secret fails");
  assert.equal(tokens.verifyEmailToken(`${contact}.x`, secret), null);
  assert.equal(tokens.verifyEmailToken("", secret), null);
  assert.equal(tokens.verifyEmailToken(contact, ""), null, "no secret, nothing verifies");
  assert.throws(() => tokens.signEmailToken({ kind: "user", userId: "u" }, ""));
  // The format automation unsubscribe links always used (brand.ts): base64url("storeId\nemail") + 32-char HMAC.
  const old = Buffer.from("store_1\nada@example.com").toString("base64url");
  const oldSig = createHmac("sha256", secret).update(old).digest("base64url").slice(0, 32);
  assert.deepEqual(tokens.verifyEmailToken(`${old}.${oldSig}`, secret), { kind: "contact", storeId: "store_1", email: "ada@example.com" });
  const links = tokens.emailLinks("https://app.example/", { kind: "user", userId: "u1" }, secret);
  assert.match(links.preferences, /^https:\/\/app\.example\/email\/preferences\/[\w-]+\.[\w-]{32}$/);
  assert.match(links.unsubscribe, /\?unsubscribe=1$/);
  assert.match(links.oneClick, /^https:\/\/app\.example\/api\/email\/unsubscribe\?token=/);
});

test("store-provided text is escaped everywhere it lands", () => {
  const evil = '"><script>alert(1)</script>';
  const html = shell.storeEmail({ appUrl: APP, store: { name: evil, legalName: evil, address: evil, logoUrl: `https://x.example/a.png"onerror="x`, contactUrl: "javascript:alert(1)", privacyUrl: "https://ok.example" }, kind: "marketing", heading: evil, bodyHtml: shell.html.p(evil), unsubscribeUrl: "javascript:alert(1)", preferencesUrl: "https://ok.example/p" });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /javascript:/i, "unsafe links become #");
  assert.doesNotMatch(html, /"onerror="/);
  assert.match(html, /&lt;script&gt;/);
});

test("preference topics: defaults on, unsubscribed blocks all, triggers map to topics", () => {
  assert.deepEqual(prefs.readContactTopics({}), { promotions: true, product_updates: true, cart_reminders: true });
  assert.deepEqual(prefs.readContactTopics({ emailTopics: { promotions: false } }), { promotions: false, product_updates: true, cart_reminders: true });
  assert.equal(prefs.contactAllows(null, "promotions"), true, "an order contact not on the list");
  assert.equal(prefs.contactAllows({ status: "unsubscribed", metadata: {} }, null), false);
  assert.equal(prefs.contactAllows({ status: "active", metadata: { emailTopics: { cart_reminders: false } } }, "cart_reminders"), false);
  assert.equal(prefs.contactAllows({ status: "active", metadata: { emailTopics: { cart_reminders: false } } }, "promotions"), true);
  assert.equal(prefs.topicForTrigger("abandoned_checkout"), "cart_reminders");
  assert.equal(prefs.topicForTrigger("browse_abandonment"), "cart_reminders");
  assert.equal(prefs.topicForTrigger("low_stock"), "product_updates");
  assert.equal(prefs.topicForTrigger("win_back"), "promotions");
  assert.equal(prefs.topicForTrigger("order_shipped"), null, "order emails are service messages");
  assert.deepEqual(prefs.PLATFORM_TOPICS.map((t) => t.key), ["product_news", "lifecycle", "weekly_summary"]);
});

test("business address: read from brand settings, required for marketing", () => {
  const empty = shell.readBusinessAddress({});
  assert.equal(shell.hasPostalAddress(empty), false);
  assert.equal(shell.formatPostalAddress(empty), null);
  const full = shell.readBusinessAddress({ businessAddress: { line1: "12 Allen Ave", line2: "", city: "Ikeja", state: "Lagos", postalCode: "100271", country: "Nigeria", legalName: 5 } });
  assert.equal(shell.formatPostalAddress(full), "12 Allen Ave, Ikeja, Lagos, Nigeria 100271");
  assert.equal(full.legalName, "", "non-strings are dropped");
  assert.match(shell.MISSING_ADDRESS_MESSAGE, /\/home\/settings\?tab=Store#business-address/);
});

test("every server sender goes through the shell; marketing sends check preferences and the address", () => {
  // Any file that sends an email builds it with a shell builder.
  const BUILDERS = /buildPlatformEmail|sendPlatformEmail|storeEmail|wrapEmail|orderConfirmationEmail|refundEmail|reviewRequestEmail|invoiceEmail|inboxReplyEmail|renderEmailPreview|previewCampaignHtml|emailBodyHtml|newTicketEmail|receivedEmail|agentReplyEmail|securityEmailHtml/;
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
    }
  };
  walk(new URL("../src", import.meta.url).pathname);
  const senders = files.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /\bsendEmail\(\{|sendEmailBatch\(|resend\.emails\.send|api\.resend\.com\/emails/.test(source) && !file.endsWith("notifications/resend.ts");
  });
  assert.ok(senders.length >= 10, `found the senders (${senders.length})`);
  for (const file of senders) assert.match(readFileSync(file, "utf8"), BUILDERS, `${file} builds its email with the shell`);

  const campaigns = read("src/lib/campaigns/send.ts");
  assert.match(campaigns, /MISSING_ADDRESS_MESSAGE/, "campaigns need a business address");
  assert.match(campaigns, /emailTopics", "promotions"/, "campaigns skip people who turned promotions off");
  assert.match(campaigns, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  assert.match(campaigns, /preferencesUrl: links\?\.preferences/);
  const flows = read("src/lib/automations/flow-engine.ts");
  assert.match(flows, /allowsTopic\(store\.id, enrollment\.email, topic\)/, "automations check topic preferences");
  assert.match(flows, /!orderEmail && !sender\.hasAddress/, "marketing automations need the address");
  assert.match(flows, /unsubscribeHeaders\(links\)/);
  const compliance = read("src/lib/email/compliance.server.ts");
  assert.match(compliance, /platformEmailAllowed\(input\.user\.id, input\.topic\)/, "lifecycle mail checks preferences");
  assert.match(compliance, /SHOPINBOS_LEGAL_NAME/);
  assert.match(compliance, /SHOPINBOS_POSTAL_ADDRESS/);
  assert.match(read("src/lib/verification/reminders.server.ts"), /kind: "lifecycle", topic: "lifecycle"/);
  assert.match(read("src/lib/notifications/resend.ts"), /headers: options\.headers/, "sendEmail passes headers through");
  // The one-click endpoint: POST, no auth, idempotent saves, outside the CSRF-checked prefixes.
  const oneClick = read("src/app/api/email/unsubscribe/route.ts");
  assert.match(oneClick, /export async function POST/);
  assert.match(oneClick, /verifyEmailToken/);
  assert.doesNotMatch(oneClick, /requireRole|getCurrentAppUser/);
  assert.doesNotMatch(read("src/lib/auth/route-access.ts").match(/PORTAL_API_PREFIXES = \[[^\]]*\]/)[0], /\/api\/email/);
  assert.match(read("src/app/email/preferences/[token]/page.tsx"), /verifyEmailToken/);
  assert.match(read("src/app/home/settings/page.tsx"), /id="business-address"/);
  assert.match(read("src/app/home/settings/page.tsx"), /t\("notif\.prefs"\)/);
  assert.match(read("shared/i18n/messages/account/en.ts"), /"notif\.prefs": "Email preferences"/);
});

test("Supabase auth templates use the shell, Go variables and our legal footer; the script pushes them", () => {
  const subjects = JSON.parse(read("docs/email/supabase/subjects.json"));
  const vars = { confirmation: ["{{ .Token }}", "{{ .ConfirmationURL }}"], magic_link: ["{{ .Token }}", "{{ .ConfirmationURL }}"], recovery: ["{{ .ConfirmationURL }}"], invite: ["{{ .ConfirmationURL }}"], email_change: ["{{ .ConfirmationURL }}", "{{ .Email }}", "{{ .NewEmail }}"], reauthentication: ["{{ .Token }}"] };
  for (const [key, needed] of Object.entries(vars)) {
    const html = read(`docs/email/supabase/${key}.html`);
    assert.ok(subjects[key]?.subject, `${key} subject`);
    assertShell(html, key);
    assert.match(html, /<img src="\{\{ \.SiteURL \}\}\/brand\/email\/shopinbos-logo-navy@2x\.png" width="210" height="20" alt="Shopinbos"/, `${key} logo`);
    assert.match(html, /\{\{ \.SiteURL \}\}\/brand\/email\/shopinbos-logo-white@2x\.png/, `${key} dark logo`);
    assert.match(html, /Tech Della Solutions LTD \(RC 7038770\)/);
    assert.match(html, /Oluyole, Ibadan, Oyo State, Nigeria, 200257/);
    assert.match(html, /service message/);
    assert.doesNotMatch(html, /placeholder|PLACEHOLDER|sib-unsubscribe/);
    for (const v of needed) assert.ok(html.includes(v), `${key} uses ${v}`);
  }
  const script = read("scripts/configure-supabase-auth.mjs");
  for (const key of Object.keys(vars)) assert.ok(script.includes(`"${key}"`), `script pushes ${key}`);
  assert.match(script, /mailer_subjects_\$\{key\}/);
  assert.match(script, /mailer_templates_\$\{key\}_content/);
  assert.match(script, /--dry-run/);
  assert.match(script, /--templates-only/);
  assert.match(script, /APP_URL not set/);
  assert.doesNotMatch(script, /process\.env\.APP_URL \?\? "https:\/\/app\.shopinbos\.com"/, "no silent SITE_URL default");
});
