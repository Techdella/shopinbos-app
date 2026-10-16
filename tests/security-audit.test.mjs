// Security audit (agent D): pure checks behind each fix, the collection IDOR fix run for real against an
// in-memory database with two stores, and wiring checked against the source.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const require = createRequire(import.meta.url);

const { retailChargeProblem } = await import("../src/lib/commerce/paystack-charge.ts");
const { cronAuthorization } = await import("../src/lib/auth/cron.ts");
const { isPrivateAddress, urlShapeProblem } = await import("../src/lib/security/ssrf.ts");
const { uploadContentProblem, svgProblem, SNIFF_BYTES } = await import("../src/lib/security/upload-sniff.ts");
const { scriptSafeJson, gaMeasurementId } = await import("../src/lib/security/html.ts");
const { verificationFileAllowed, verificationFileHref } = await import("../src/lib/security/private-files.ts");
const { publicBrandSettings } = await import("../shared/public-brand-settings.ts");
const routing = require(path.join(ROOT, "src/lib/intent-routing.js"));

// ─── Payments ─────────────────────────────────────────────────────────────────

test("a Paystack charge only marks a storefront order paid for the full amount, in its currency, once", () => {
  const order = { id: "ord_1", total: 15000, currency: "NGN", status: "pending" };
  const charge = { reference: "ord_1", amount: 1_500_000, currency: "NGN", status: "success" };
  assert.equal(retailChargeProblem(order, charge), null);
  assert.equal(retailChargeProblem({ ...order, status: "awaiting_payment" }, charge), null);
  assert.equal(retailChargeProblem(order, { ...charge, amount: 1_600_000 }), null, "overpaying is fine");
  // The buyer's browser picks the amount for inline payments: ₦100 must not pay for a ₦15,000 order.
  assert.match(retailChargeProblem(order, { ...charge, amount: 10_000 }), /less than/);
  assert.match(retailChargeProblem(order, { ...charge, currency: "USD" }), /currency/);
  assert.match(retailChargeProblem(order, { ...charge, reference: "ord_2" }), /reference/);
  assert.match(retailChargeProblem(order, { ...charge, status: "failed" }), /did not succeed/);
  assert.match(retailChargeProblem(order, { ...charge, amount: "abc" }), /no amount/);
  // A replayed or retried event can't move a shipped order back to paid.
  for (const status of ["paid", "shipped", "delivered", "cancelled", "refunded"]) {
    assert.match(retailChargeProblem({ ...order, status }, charge), /not awaiting payment/, status);
  }
  assert.match(retailChargeProblem(null, charge), /not found/);
});

test("the Paystack webhook checks the charge and only moves a still-unpaid order", () => {
  const source = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(source, /retailChargeProblem\(pending, event\.data/);
  assert.match(source, /status: \{ in: \[\.\.\.PAYABLE_ORDER_STATUSES\] \}/);
  assert.match(source, /if \(moved\.count === 1\) await creditCampaignConversion/);
  assert.match(source, /moved\.count === 1 && resendKey/, "confirmation email only on the first transition");
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /updateMany\(\{\s*where: \{ id: ref \},\s*data: \{ status: "paid"/);
  const action = read("src/app/actions/payments.ts");
  assert.match(action, /Payment currency does not match this order/);
  assert.match(action, /status: \{ in: \["pending", "awaiting_payment"\] \}/);
});

// ─── Cron and secrets ─────────────────────────────────────────────────────────

test("cron routes need CRON_SECRET, compared in constant time", () => {
  assert.equal(cronAuthorization("Bearer s3cret", "s3cret"), "ok");
  assert.equal(cronAuthorization("Bearer wrong", "s3cret"), "denied");
  assert.equal(cronAuthorization("Bearer s3cret ", "s3cret"), "denied");
  assert.equal(cronAuthorization(null, "s3cret"), "denied");
  assert.equal(cronAuthorization("Bearer ", ""), "unconfigured");
  assert.equal(cronAuthorization("Bearer undefined", undefined), "unconfigured");
  for (const file of ["src/app/api/cron/reviews/route.ts", "src/app/api/cron/marketing/route.ts", "src/app/api/cron/campaigns/route.ts", "src/app/api/conversations/cron/route.ts"]) {
    const source = read(file);
    assert.match(source, /cronAuthorization\(req\.headers\.get\("authorization"\), secret\) !== "ok"/, file);
    assert.doesNotMatch(source, /!== `Bearer \$\{secret\}`/, file);
  }
});

test("Peggy's confirmation codes never fall back to a hard-coded key", () => {
  const source = read("src/lib/marketing/brand.ts");
  assert.doesNotMatch(source, /\|\| "peggy"/);
  assert.match(source, /if \(process\.env\.NODE_ENV === "production"\) return null;/);
  assert.match(source, /if \(!code \|\| !confirmationKey\(\)\) return false;/);
});

// ─── SSRF ─────────────────────────────────────────────────────────────────────

test("private, loopback, link-local and metadata addresses are refused (v4, v6 and mapped forms)", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::10.0.0.1", "[::1]", "not-an-ip"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "102.89.1.1", "172.32.0.1", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("user-supplied URLs: only public http(s) hosts without credentials", () => {
  assert.equal(urlShapeProblem("https://cdn.example.com/a.jpg"), null);
  assert.equal(urlShapeProblem("http://cdn.example.com/a.jpg"), null);
  assert.ok(urlShapeProblem("http://cdn.example.com/a.jpg", { httpsOnly: true }));
  for (const url of ["file:///etc/passwd", "gopher://x.com", "javascript:alert(1)", "https://user:pw@example.com/", "http://localhost/", "http://api.localhost/", "http://metadata.google.internal/", "http://169.254.169.254/latest/meta-data", "http://2130706433/", "http://0x7f000001/", "http://[::1]/", "http://intranet/", "not a url"]) {
    assert.ok(urlShapeProblem(url), url);
  }
  // Wiring: seller photo downloads and partner webhooks go through the DNS-checked fetch.
  assert.match(read("src/app/api/app/social/image/route.ts"), /safeFetch\(source, \{ signal \}\)/);
  assert.match(read("src/lib/logistics/webhooks.ts"), /await assertPublicUrl\(hook\.url, \{ httpsOnly: true \}\);/);
  const safeFetch = read("src/lib/security/safe-fetch.server.ts");
  assert.match(safeFetch, /redirect: "manual"/);
  assert.match(safeFetch, /lookup\(host, \{ all: true/);
});

// ─── Uploads ──────────────────────────────────────────────────────────────────

const bytes = (...values) => {
  const out = new Uint8Array(SNIFF_BYTES);
  values.forEach((value, index) => (out[index] = typeof value === "string" ? value.charCodeAt(0) : value));
  return out;
};
const text = (value) => {
  const out = new Uint8Array(SNIFF_BYTES);
  [...value].forEach((char, index) => (out[index] = char.charCodeAt(0)));
  return out;
};

test("uploads must really be the type they claim", () => {
  assert.equal(uploadContentProblem("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), null);
  assert.equal(uploadContentProblem("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)), null);
  assert.equal(uploadContentProblem("image/gif", text("GIF89a")), null);
  assert.equal(uploadContentProblem("image/webp", text("RIFF\0\0\0\0WEBP")), null);
  assert.equal(uploadContentProblem("application/pdf", text("%PDF-1.7")), null);
  assert.equal(uploadContentProblem("video/mp4", text("\0\0\0\x18ftypmp42")), null);
  // HTML (or anything else) labelled as an image or a PDF is refused.
  assert.ok(uploadContentProblem("image/png", text("<html><script>")));
  assert.ok(uploadContentProblem("image/jpeg", text("GIF89a")));
  assert.ok(uploadContentProblem("application/pdf", text("<svg onload=x>")));
  assert.ok(uploadContentProblem("text/html", text("<html>")));
  assert.ok(uploadContentProblem("image/svg+xml", text("<svg>")), "SVG needs its text");
});

test("SVG uploads: plain drawings only", () => {
  assert.equal(svgProblem('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#0E2A38" font-family="x"/><use href="#a"/></svg>'), null);
  for (const svg of [
    "<svg><script>alert(1)</script></svg>",
    '<svg onload="alert(1)"></svg>',
    "<svg><a href=\"javascript:alert(1)\">x</a></svg>",
    "<svg><foreignObject><iframe src=x></iframe></foreignObject></svg>",
    '<svg><use href="https://evil.example/x.svg#a"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    "<html><body>not svg</body></html>",
  ]) {
    assert.ok(svgProblem(svg), svg);
  }
});

test("every server upload is sniffed, private files go through signed links, names are unguessable", () => {
  const storage = read("src/lib/supabase/storage.server.ts");
  assert.match(storage, /export async function uploadFileServer[\s\S]*?await assertUploadContent\(file\);/);
  assert.match(storage, /export async function uploadPrivateFile[\s\S]*?await assertUploadContent\(file\);/);
  assert.match(storage, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(storage, /file\.name\.split\("\."\)\.pop\(\) \?\? "bin"/, "extension never comes from the file name alone");
  assert.match(read("src/app/api/conversations/[id]/files/route.ts"), /uploadPrivateFile\(`messages\//);
  assert.match(read("src/lib/support/service.server.ts"), /uploadPrivateFile\(`support\//);
  const verification = read("src/app/actions/verification.ts");
  assert.match(verification, /assertUploadContent\(file\)/);
  assert.match(verification, /privateBucket\(\) \?\? BUCKET/);
  assert.match(read("src/components/verification/upload-client.ts"), /return verificationFileHref\(filePath\);/);
  assert.doesNotMatch(read("src/components/verification/upload-client.ts"), /object\/public/);
});

test("verification documents open only for their owner or an admin", () => {
  const supplierDoc = "supplier-verifications/sup_1/identity/1700000000000-abc.pdf";
  assert.equal(verificationFileAllowed(supplierDoc, { role: "supplier", ownerId: "sup_1" }), true);
  assert.equal(verificationFileAllowed(supplierDoc, { role: "supplier", ownerId: "sup_2" }), false);
  assert.equal(verificationFileAllowed(supplierDoc, { role: "logistics_partner", ownerId: "sup_1" }), false);
  assert.equal(verificationFileAllowed(supplierDoc, { role: "seller", ownerId: null }), false);
  assert.equal(verificationFileAllowed(supplierDoc, { role: "admin", ownerId: null }), true);
  assert.equal(verificationFileAllowed("logistics-verifications/lp_1/cac/x.png", { role: "logistics_partner", ownerId: "lp_1" }), true);
  for (const bad of ["supplier-verifications/sup_1/../sup_2/identity/x.pdf", "/supplier-verifications/sup_1/identity/x.pdf", "messages/conv/x.pdf", "supplier-verifications/sup_1", "supplier-verifications/sup_1//x.pdf", "supplier-verifications/sup_1/identity/x.pdf?x=1", ""]) {
    assert.equal(verificationFileAllowed(bad, { role: "admin", ownerId: null }), false, bad);
    assert.equal(verificationFileAllowed(bad, { role: "supplier", ownerId: "sup_1" }), false, bad);
  }
  assert.equal(verificationFileHref("supplier-verifications/a b/c.pdf"), "/api/verification/file?path=supplier-verifications%2Fa%20b%2Fc.pdf");
  assert.match(read("src/app/api/verification/file/route.ts"), /\["supplier", "logistics_partner", "admin"\]/);
});

// ─── XSS ──────────────────────────────────────────────────────────────────────

test("JSON-LD can't close its <script> and the GA ID can't inject script", () => {
  const out = scriptSafeJson({ name: '</script><script>alert(1)</script>', note: "a & b \u2028" });
  assert.doesNotMatch(out, /<\/script/i);
  assert.doesNotMatch(out, /[<>&\u2028]/);
  assert.deepEqual(JSON.parse(out), { name: '</script><script>alert(1)</script>', note: "a & b \u2028" });
  assert.equal(gaMeasurementId("G-ABC123XYZ"), "G-ABC123XYZ");
  assert.equal(gaMeasurementId(" g-abc123 "), "G-ABC123");
  for (const bad of ["G-1');alert(document.cookie);//", "UA-12345-1", "", null, 42, "G-"]) assert.equal(gaMeasurementId(bad), "", String(bad));
  // The storefront's JSON-LD lives in the shared route renderer (page.tsx and [collection] use it). The seller's
  // GA / Tag Manager / pixels load from the storefront layout, built only from validated IDs
  // (src/lib/storefront/integrations.ts; tests/store-traffic.test.mjs covers the validators and the scripts).
  const page = read("src/app/s/[slug]/storefront-route.tsx");
  assert.match(page, /__html: scriptSafeJson\(item\)/);
  assert.doesNotMatch(page, /googletagmanager/, "GA moved to the layout, so it isn't loaded twice");
  const integrations = read("src/lib/storefront/integrations.ts");
  assert.match(integrations, /googleAnalyticsId: gaMeasurementId,/);
  assert.match(integrations, /const ga = gaMeasurementId\(integrations\.googleAnalyticsId\);/);
  assert.match(read("src/app/s/[slug]/layout.tsx"), /<StoreTrackingTags integrations=\{integrations\} slug=\{slug\} consent=\{consent\}/);
  assert.match(read("src/app/s/[slug]/product/[productId]/ProductPageView.tsx"), /__html: scriptSafeJson\(/);
  assert.match(read("src/app/actions/workspace.ts"), /const googleAnalyticsId = gaMeasurementId\(formData\.get\("googleAnalyticsId"\)\);/);
  // Every JSON-LD script in the app goes through an escaping helper.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith(".tsx") && /__html: JSON\.stringify\(/.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(ROOT, file));
    }
  };
  walk(path.join(ROOT, "src"));
  assert.deepEqual(offenders, []);
});

test("the CSP allows Meta's signup SDK narrowly and forbids framing", () => {
  const config = read("next.config.ts");
  assert.match(config, /"script-src [^"]*https:\/\/connect\.facebook\.net"/);
  assert.match(config, /"frame-src [^"]*https:\/\/www\.facebook\.com https:\/\/web\.facebook\.com"/);
  assert.match(config, /"connect-src [^"]*https:\/\/graph\.facebook\.com/);
  assert.doesNotMatch(config, /\*\.facebook\.com|\*\.facebook\.net/);
  assert.match(config, /"frame-ancestors 'none'"/);
  assert.match(config, /"object-src 'none'"/);
});

// ─── Redirects, cookies, brand settings ───────────────────────────────────────

test("sanitizeNextPath refuses backslash and protocol-relative tricks", () => {
  for (const bad of ["/\\evil.com", "//evil.com", "/\\/evil.com", "/\tevil.com", "https://evil.example/x", "https://app.shopinbos.com/\\evil.com", "javascript:alert(1)"]) {
    assert.equal(routing.sanitizeNextPath(bad, "https://app.shopinbos.com"), null, bad);
  }
  assert.equal(routing.sanitizeNextPath("/home/orders?tab=open", "https://app.shopinbos.com"), "/home/orders?tab=open");
  assert.equal(routing.sanitizeNextPath("https://app.shopinbos.com/marketplace?intent=add", "https://app.shopinbos.com"), "/marketplace?intent=add");
});

test("session cookies are Secure in production on every Supabase client", () => {
  assert.match(read("src/lib/supabase/server.ts"), /cookieOptions: \{ path: "\/", sameSite: "lax", secure: process\.env\.NODE_ENV === "production" \}/);
  assert.match(read("src/lib/supabase/browser.ts"), /cookieOptions: \{ path: "\/", sameSite: "lax", secure \}/);
  assert.equal(fs.existsSync(path.join(ROOT, "middleware.ts")), false, "the dead root middleware is gone (src/proxy.ts is the only one)");
});

test("shoppers never get the owner's setup, notification settings or unpublished draft", () => {
  const settings = {
    themeTokens: { accent: "#000" },
    setup: { start: "rex", checklist: { a: true } },
    notifications: { provider: "sendchamp" },
    connectedChannels: ["whatsapp"],
    chipTone: "warm",
    payoutBank: { accountNumber: "0123456789" },
    launchBilling: { status: "paid" },
    editor: { published: { pages: [1] }, draft: { pages: [2] } },
  };
  const pub = publicBrandSettings(settings);
  for (const key of ["setup", "notifications", "connectedChannels", "chipTone", "payoutBank", "launchBilling"]) assert.equal(key in pub, false, key);
  assert.deepEqual(pub.editor, { published: { pages: [1] } });
  assert.deepEqual(pub.themeTokens, { accent: "#000" });
  // A store that never published still renders from its draft.
  assert.deepEqual(publicBrandSettings({ editor: { draft: { pages: [2] } } }).editor, { draft: { pages: [2] } });
});

// ─── Server actions and portal APIs ───────────────────────────────────────────

test("server actions that read by id check the caller owns it", () => {
  const billing = read("src/app/actions/billing.ts");
  assert.match(billing, /export async function getBillingData\(logisticsPartnerId: string\) \{\s*\/\/[^\n]*\n\s*const user = await requireRole/);
  const messaging = read("src/app/actions/messaging.ts");
  assert.match(messaging, /export async function getConversations\(userId: string\) \{[\s\S]{0,200}if \(userId !== user\.id\) return \[\];/);
  assert.doesNotMatch(messaging, /export async function markAsRead/);
  assert.match(messaging, /where: \{ id: convId, OR: \[\{ participant1Id: user\.id \}, \{ participant2Id: user\.id \}\] \}/);
  assert.match(read("src/app/actions/reviews.ts"), /export async function getReviewMetrics\(logisticsPartnerId: string\) \{[\s\S]{0,200}requireRole\(\["logistics_partner", "admin"\]/);
  const supplierReviews = read("src/app/actions/supplier-reviews.ts");
  for (const fn of ["getSupplierReviewMetrics", "getReviewableOrders", "getReviewableBookings"]) {
    assert.match(supplierReviews, new RegExp(`export async function ${fn}\\(supplierId: string\\) \\{\\s*await assertOwnSupplier\\(supplierId\\);`), fn);
  }
  assert.match(supplierReviews, /where: \{ id: bookingId, sellerId: user\.id \}/);
  const workspace = read("src/app/actions/workspace.ts");
  assert.match(workspace, /SERVER_OWNED_BRAND_KEYS = \["launchBilling", "payoutBank", "pendingInvites", "rexVersions", "domainOrders"\]/);
  assert.match(workspace, /for \(const key of SERVER_OWNED_BRAND_KEYS\) delete/);
});

test("every exported function in a \"use server\" file checks who is calling (or is a known public action)", () => {
  // Public on purpose: the storefront checkout confirms a Paystack payment for a buyer with no account; the
  // order id plus a verified Paystack reference for that order and amount is the credential.
  const PUBLIC = new Set(["verifyPaystackPayment", "updateOrderPayment"]);
  const AUTH = /requireRole\(|requireUser\(|getCurrentAppUser\(|getSellerUserOrThrow\(|requireAdmin\(|requireSellerStore\(|getLogisticsActor\(|getSupplierActor\(|sellerAndStore\(|assertOwnSupplier\(|getSupplierForUser\(|requirePartner\(|applyPlanUpgrade\(|upgradeUserToSupplierMax\(|linkSupplierPaystackRecipient\(|getPartner\(|currentPartner\(|actor\(/;
  const missing = [];
  for (const entry of fs.readdirSync(path.join(ROOT, "src/app/actions"))) {
    const source = read(`src/app/actions/${entry}`);
    if (!source.startsWith('"use server"')) continue;
    for (const match of source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{/g)) {
      const body = source.slice(match.index, match.index + 1500).split(/\nexport /)[0];
      if (!PUBLIC.has(match[1]) && !AUTH.test(body)) missing.push(`${entry}:${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the public storefront APIs that write are rate limited", () => {
  for (const route of ["checkout", "orders/lookup", "forms", "abandoned-cart", "checkout/quote", "cart", "wishlist", "visit"]) {
    assert.match(read(`src/app/api/public/store/[slug]/${route}/route.ts`), /overPublicLimit\(req\.headers, "\w+"\)/, route);
  }
});

test("phone sign-in codes: Supabase is only asked for SMS; WhatsApp is ours (env-gated) and the screens say what was used", () => {
  assert.match(read("src/app/api/auth/otp/route.ts"), /channel: "sms", data/);
  assert.match(read("apps/mobile/src/lib/auth.ts"), /channel: "sms", data/, "the phone app never asks Supabase for WhatsApp (that needs Twilio)");
  // The WhatsApp button only shows when GET /api/auth/otp says it is on, and the code screen follows the channel used.
  const web = read("src/components/auth/app/AppAuth.tsx");
  assert.match(web, /fetchWhatsAppCodes/);
  assert.match(web, /setChannel\(used\)/);
  const mobile = read("apps/mobile/src/components/AuthForm.tsx");
  assert.match(mobile, /fetchWhatsAppCodes/);
  assert.match(mobile, /method === "phone" && whatsapp/);
  assert.match(read("apps/mobile/src/app/verify.tsx"), /setChannel\(used\)/);
});

test("a migration turns RLS on for every public table and adds a private bucket", () => {
  const sql = read("docs/migrations/2026-10-13-security-rls-storage.sql");
  assert.match(sql, /FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /VALUES \('shopinbos-private', 'shopinbos-private', false\)/);
  assert.match(sql, /FOR INSERT TO authenticated\s+WITH CHECK \(bucket_id = 'shopinbos-media' AND name LIKE 'products\/%'\)/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b|\bDROP COLUMN\b/i);
});

// ─── IDOR: collections, run for real against two stores ───────────────────────

const HOOKS = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
let root = "";
export async function initialize(data) { root = data.root; }
function find(base) {
  for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
const STUBS = ["lib/auth/middleware", "lib/db/client", "lib/api/response"];
export async function resolve(specifier, context, next) {
  if (specifier === "next/server") return { url: "mock:next/server", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    if (STUBS.includes(rel)) return { url: "mock:" + rel, shortCircuit: true };
    const file = find(root + "/src/" + rel);
    if (!file) throw new Error("Can't find " + specifier);
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === "mock:next/server") return { format: "module", source: "export class NextRequest {}; export class NextResponse {};", shortCircuit: true };
  if (url === "mock:lib/auth/middleware") return { format: "module", source: "export const withSeller = (h) => (req, ctx) => globalThis.__sec.withSeller(h, req, ctx);", shortCircuit: true };
  if (url === "mock:lib/db/client") return { format: "module", source: "export const db = new Proxy({}, { get: (_, k) => globalThis.__sec.db[k] });", shortCircuit: true };
  if (url === "mock:lib/api/response") return { format: "module", source: [
    "export const ok = (data, status = 200) => ({ status, data });",
    "export const okList = (data, meta) => ({ status: 200, data, meta });",
    "export const apiError = (code, message, status = 400) => ({ status, error: { code, message } });",
    "export const noContent = () => ({ status: 204 });",
    "export const parsePagination = () => ({ page: 1, limit: 20, skip: 0 });",
  ].join("\\n"), shortCircuit: true };
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOKS)}`, { data: { root: ROOT } });

function fakeDb() {
  const stores = [{ id: "store-A", userId: "user-A" }, { id: "store-B", userId: "user-B" }];
  const products = [{ id: "pA1", storeId: "store-A" }, { id: "pA2", storeId: "store-A" }, { id: "pB1", storeId: "store-B" }];
  const collections = [{ id: "colA", storeId: "store-A" }, { id: "colB", storeId: "store-B" }];
  const links = [];
  const hit = (row, where = {}) => Object.entries(where).every(([key, cond]) => (cond && typeof cond === "object" && "in" in cond ? cond.in.includes(row[key]) : row[key] === cond));
  return {
    links,
    store: { findUnique: async ({ where }) => stores.find((row) => hit(row, where)) ?? null },
    storeProduct: { findMany: async ({ where }) => products.filter((row) => hit(row, where)).map((row) => ({ id: row.id })) },
    collection: {
      findUnique: async ({ where }) => {
        const row = collections.find((c) => hit(c, where));
        return row ? { ...row, _count: { products: links.filter((l) => l.collectionId === row.id).length }, products: [] } : null;
      },
      create: async ({ data }) => {
        const row = { id: `col${collections.length + 1}`, storeId: data.storeId };
        collections.push(row);
        for (const link of data.products?.create ?? []) links.push({ collectionId: row.id, ...link });
        return { ...row, _count: { products: links.filter((l) => l.collectionId === row.id).length } };
      },
      update: async ({ where, data }) => {
        if (data.products) {
          for (let i = links.length - 1; i >= 0; i--) if (links[i].collectionId === where.id) links.splice(i, 1);
          for (const link of data.products.create) links.push({ collectionId: where.id, ...link });
        }
        return { id: where.id, products: [], _count: { products: links.filter((l) => l.collectionId === where.id).length } };
      },
    },
    collectionProduct: {
      findMany: async ({ where }) => links.filter((l) => l.collectionId === where.collectionId && where.productId.in.includes(l.productId)),
      findFirst: async () => null,
      createMany: async ({ data }) => { links.push(...data); return { count: data.length }; },
      deleteMany: async () => ({ count: 0 }),
    },
  };
}

function asSeller(userId) {
  globalThis.__sec.withSeller = (handler, req, ctx) => handler(req, { user: { id: userId, role: "seller" }, params: ctx?.params ?? {} });
}
const jsonReq = (body) => ({ json: async () => body, url: "http://localhost/api" });

test("IDOR: a seller can't put another store's products in their collection", async () => {
  globalThis.__sec = { db: fakeDb() };
  asSeller("user-A");
  const { POST } = await import("../src/app/api/store/collections/[id]/products/route.ts");

  // Store A adds its own product and store B's product: only its own is linked.
  const res = await POST(jsonReq({ productIds: ["pA1", "pB1"] }), { params: { id: "colA" } });
  assert.equal(res.status, 200);
  assert.deepEqual(globalThis.__sec.db.links.map((l) => l.productId), ["pA1"]);

  // Only foreign ids: refused, nothing linked.
  const foreign = await POST(jsonReq({ productIds: ["pB1"] }), { params: { id: "colA" } });
  assert.equal(foreign.status, 404);
  assert.equal(globalThis.__sec.db.links.length, 1);

  // Another store's collection by id: not found.
  const other = await POST(jsonReq({ productIds: ["pA2"] }), { params: { id: "colB" } });
  assert.equal(other.status, 404);

  // Oversized or malformed bodies are refused by the schema.
  assert.equal((await POST(jsonReq({ productIds: Array.from({ length: 501 }, (_, i) => `p${i}`) }), { params: { id: "colA" } })).status, 400);
  assert.equal((await POST(jsonReq({ productIds: [{ id: "pA1" }] }), { params: { id: "colA" } })).status, 400);
});

test("IDOR: creating or replacing a collection's products keeps only the seller's own", async () => {
  globalThis.__sec = { db: fakeDb() };
  asSeller("user-A");
  const { POST } = await import("../src/app/api/store/collections/route.ts");
  const created = await POST(jsonReq({ name: "Sale", slug: "sale", productIds: ["pB1", "pA2", "pA1", "pA2"] }), {});
  assert.equal(created.status, 201);
  assert.deepEqual(globalThis.__sec.db.links.map((l) => [l.productId, l.sortOrder]), [["pA2", 0], ["pA1", 1]]);

  const { PATCH } = await import("../src/app/api/store/collections/[id]/route.ts");
  const patched = await PATCH(jsonReq({ productIds: ["pB1", "pA1"] }), { params: { id: "colA" } });
  assert.equal(patched.status, 200);
  assert.deepEqual(globalThis.__sec.db.links.filter((l) => l.collectionId === "colA").map((l) => l.productId), ["pA1"]);

  // Store B's collection can't be edited by store A at all.
  const otherStore = await PATCH(jsonReq({ name: "Mine now" }), { params: { id: "colB" } });
  assert.equal(otherStore.status, 404);
});

test("domains: buying is opt-in, priced by Vercel, capped, and an order attaches only to the store that placed it", async () => {
  const { domainOrdersOf } = await import("../src/lib/domains/orders.ts");
  assert.deepEqual(domainOrdersOf({ domainOrders: ["ord_1", 5, "", "ord_2"] }), ["ord_1", "ord_2"]);
  assert.deepEqual(domainOrdersOf(null), []);
  assert.deepEqual(domainOrdersOf({ domainOrders: "ord_1" }), []);
  const purchase = read("src/app/api/domains/purchase/route.ts");
  assert.match(purchase, /if \(process\.env\.DOMAIN_PURCHASE_ENABLED !== "true"\)/);
  // The seller pays first; the domain is bought after a verified payment, one year, never auto-renewed by Vercel,
  // capped at the quoted cost (tests/domain-billing.test.mjs covers the payment side).
  assert.doesNotMatch(purchase, /buyDomainOnVercel/);
  assert.doesNotMatch(purchase, /expectedPrice: parsed\.data\.expectedPrice/);
  assert.match(read("src/lib/domains/billing.server.ts"), /buyDomainOnVercel\(row\.domain, \{ years: 1, autoRenew: false, maxPrice,/);
  const vercel = read("src/lib/domains/vercel.ts");
  assert.match(vercel, /expectedPrice: pricing\.purchasePrice,/);
  assert.match(read("src/app/api/domains/order/[orderId]/route.ts"), /if \(!domainOrdersOf\(store\.brandSettings\)\.includes\(String\(orderId\)\)\)/);
  assert.equal("domainOrders" in publicBrandSettings({ domainOrders: ["x"] }), false);
});
