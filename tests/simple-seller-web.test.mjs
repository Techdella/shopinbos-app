// Simplicity rules (build spec section 8A) for the seller web app and the supplier web portal: features keep their
// standard commerce names (Segments, Campaigns, Analytics, Domain, Dropship, Payouts, Quote requests…; first-time
// users learn them from tooltips and short explainers), while truly technical setup is folded away or swapped for
// "we'll set it up for you" (SetupHelpRequest), and the friendly WhatsApp message helpers round-trip.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");

// ─── "We'll set it up for you" ────────────────────────────────────────────────

test("nothing technical for sellers: no technical-details folds, no pasted keys or records; accounts connect by signing in", () => {
  // Domain copy lives in the domain catalog (shared/i18n/messages/domain/en.ts); the screens show it through t().
  const domainCopy = read("shared/i18n/messages/domain/en.ts");
  const connect = read("src/app/home/domain/DomainConnect.tsx") + domainCopy;
  const ownership = read("src/components/domains/DomainOwnership.tsx");
  assert.match(connect, /<SetupHelpRequest/);
  assert.match(connect, /Use your own domain/);
  assert.match(connect, /Buy a new one/);
  assert.match(connect, /\.\.\.\(configured \?/, "buying only shows when the purchase flow is on");
  assert.match(connect, /I already have one/);
  assert.match(connect, /Ask the Shopinbos team to do it/);
  // A domain bought elsewhere: "Ask us to connect it" and "Check now"; no DNS records, no "send the steps".
  assert.match(ownership, /<SetupHelpRequest/);
  assert.match(ownership, /t\("pend\.askUs"\)[\s\S]*t\("pend\.checkNow"\)/);
  assert.doesNotMatch(ownership, /RecordList|whatsappShareUrl|pend\.sendWa|pend\.copy/);
  assert.match(ownership, /<Pill tone="success" dot>\{t\("own\.connected"\)\}<\/Pill>/);

  // No seller screen has a "Show the technical details" fold any more.
  assert.doesNotMatch(read("src/components/simple/Fold.tsx"), /export function TechFold/);
  for (const file of [
    "src/app/home/inbox/channels/ChannelsClient.tsx",
    "src/app/home/inbox/chatbot/WhatsAppPeggyClient.tsx",
    "src/app/home/inbox/whatsapp-catalog/WhatsAppCatalogClient.tsx",
    "src/app/home/inbox/email/EmailSetupClient.tsx",
    "src/app/home/reviews/sources/page.tsx",
    "src/app/home/connections/page.tsx",
    "src/app/home/seo/page.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /TechFold|forWho|Callback URL|Verify token|Measurement ID|G-XXXXXXXXXX|GTM-|accessToken"|phoneNumberId"|RecordCard|RegistrarTip/, file);
  }

  // Connections: every account on one page, each with one button; Google is one sign-in for everything Google.
  const connections = read("src/app/home/connections/page.tsx");
  assert.match(connections, /<ConnectAccounts storeId=\{store\.id\} only=\{\["whatsapp", "meta"\]\}/);
  assert.match(connections, /\/api\/app\/sales-channels\/google\/connect\?next=/);
  assert.doesNotMatch(connections, /<input[^>]+name="(googleAnalyticsId|gtmContainerId|metaPixelId|tiktokPixelId|gaSiteVerification|bingSiteVerification|pinterestSiteVerification)"/);

  // Sell everywhere: one card per platform with one button; no help forms, folds, feed links or token forms.
  const channels = read("src/app/channels/page.tsx") + read("src/app/channels/ChannelClient.tsx");
  assert.match(channels, /<ConnectAccounts|<ConnectCard/);
  assert.match(channels, /<SoonCard/);
  assert.doesNotMatch(channels, /<SetupHelpRequest|<TechFold|<Fold\b|<CopyField value=\{feed|MetaConnectForm|VoiceInput|Mic/);
  const socialCopy = read("shared/i18n/messages/social/en.ts");
  assert.match(socialCopy, /"card\.connect": "Connect"/);
  assert.match(socialCopy, /"soon\.notify": "Tell me when it's ready"/);
  const catalog = read("src/app/home/inbox/whatsapp-catalog/WhatsAppCatalogClient.tsx");
  assert.match(catalog, /<SetupHelpRequest/);
  assert.doesNotMatch(catalog, /<CopyRow|rotate_token|catalog_management<\/b>/);
  assert.match(catalog, /plainMetaError/);
});

test("Meta permission problems read as 'We need your permission on Facebook'", async () => {
  const { plainMetaError } = await import("../src/components/simple/plain.ts");
  assert.match(plainMetaError("(#200) Requires catalog_management permission"), /We need your permission on Facebook/);
  assert.match(plainMetaError("Error validating access token: Session has expired"), /We need your permission on Facebook/);
  assert.doesNotMatch(plainMetaError("(#100) Invalid parameter"), /catalog_management|#100|Invalid/);
});

test("WhatsApp messages: sellers type [Customer's first name], WhatsApp gets {{1}}", async () => {
  const f = await import("../src/app/home/marketing/_kit/friendly.ts");
  const friendly = "Hi [Customer's first name], use [Discount code] at [Shop name] today.";
  const { body, variables } = f.fromFriendly(friendly);
  assert.equal(body, "Hi {{1}}, use {{2}} at {{3}} today.");
  assert.deepEqual(variables, ["first_name", "discount_code", "store_name"]);
  assert.equal(f.toFriendly(body, variables), friendly);
  // Unknown [words] stay text; unmapped placeholders survive the round trip.
  assert.deepEqual(f.fromFriendly("Size [M] for you"), { body: "Size [M] for you", variables: [] });
  assert.equal(f.toFriendly("Hi {{1}}", [""]), "Hi [Customer detail 1]");
  assert.deepEqual(f.fromFriendly("Hi [Customer detail 1] there"), { body: "Hi {{1}} there", variables: [""] });
  assert.equal(f.categoryLabel("MARKETING"), "Promotion");
  assert.equal(f.categoryLabel("UTILITY"), "Order update");
  assert.equal(f.friendlyName("weekend_sale"), "Weekend sale");
  assert.match(f.plainRejection("TAG_CONTENT_MISMATCH"), /promotion/);
  assert.doesNotMatch(f.plainProblem("Variables must go {{1}}, {{2}}, … in order without gaps; {{2}} is missing."), /\{\{/);

  const text = read("src/app/home/marketing/_kit/text.tsx");
  assert.match(text, /PENDING: \{ tone: "info", label: "Waiting for WhatsApp to approve \(usually a few minutes\)" \}/);
  assert.match(text, /APPROVED: \{ tone: "success", label: "Approved" \}/);
  const marketingCopy = read("shared/i18n/messages/marketing/en.ts");
  const editor = read("src/app/home/marketing/whatsapp/WhatsAppTemplates.tsx");
  assert.match(editor, /t\("wa\.saidNo"\)/);
  assert.match(marketingCopy, /"wa\.saidNo": "WhatsApp said no:"/);
  assert.match(editor, /label: t\("wa\.category\.MARKETING"\) \}, \{ value: "UTILITY", label: t\("wa\.category\.UTILITY"\) \}/);
  assert.match(marketingCopy, /"wa\.category\.MARKETING": "Promotion",\n  "wa\.category\.UTILITY": "Order update"/);
  assert.doesNotMatch(editor.slice(0, editor.indexOf("<AdvancedFold")), /Add variable|font-mono/);
});

test("the HTML email editor is an advanced option; the visual builder is the default", () => {
  assert.match(read("shared/i18n/messages/emailBuilder/en.ts"), /"composer\.advancedFold": "Advanced \(optional\): write the email in HTML code"/);
  for (const file of ["src/app/home/marketing/_kit/EmailBuilder.tsx", "src/app/home/marketing/_kit/EmailComposer.tsx"]) {
    const src = read(file);
    assert.match(src, /<AdvancedFold label=\{t\("composer\.advancedFold"\)\}/, file);
    assert.match(src, /useState<"visual" \| "html">\(initial \|\| !(?:content\.bodyHtml|value)\.trim\(\) \? "visual" : "html"\)/, file);
    assert.doesNotMatch(src, /label: "HTML" \}/, file);
  }
});

test("supplier orders are grouped New, To pack and Sent, with 'You get ₦X' and one big Accept", () => {
  const orders = read("src/app/supplier/orders/page.tsx");
  // The words are in the supplier catalog (shared/i18n/messages/supplier/en.ts), shown through t().
  const words = read("shared/i18n/messages/supplier/en.ts");
  assert.match(orders, /\{ key: "new", label: "New", wholesale: \["pending"\], dropship: \["pending"\] \}/);
  assert.match(orders, /\{ key: "to-pack", label: "To pack"/);
  assert.match(orders, /\{ key: "sent", label: "Sent"/);
  assert.match(orders, /const LEGACY_FILTER[^\n]*"to-ship": "to-pack"/, "old ?status= links still work");
  assert.match(orders, /GROUPS\.map\(\(group\)/);
  assert.equal((orders.match(/>\{t\("orders\.youGet"\)\}</g) ?? []).length, 2, "both kinds of order show what the supplier gets");
  assert.match(words, /"orders\.youGet": "You get"/);
  assert.match(orders, /buttonClass\.ink\} min-h-\[52px\][^>]*><Icon name="check" size=\{16\} \/> \{t\("orders\.accept"\)\}</);
  assert.match(words, /"orders\.accept": "Accept"/);
  assert.match(orders, /t\("orders\.packWithLabel", \{ shop: order\.shop \}\)/);
  assert.match(words, /"orders\.packWithLabel": "Pack it with \{shop\}'s label/);
});

test("seller and supplier nav entries use the standard commerce names; routes are unchanged", () => {
  const nav = read("src/lib/nav.ts");
  for (const [id, label, href] of [
    ["inventory", "Inventory", "/home/inventory"],
    ["dropship", "Dropship", "/home/dropship"],
    ["segments", "Segments", "/home/marketing/segments"],
    ["checkout", "Checkout", "/home/checkout"],
    ["seo", "SEO", "/home/seo"],
    ["templates", "Templates", "/builder/templates"],
    ["domain", "Domain", "/home/domain"],
    ["campaigns", "Campaigns", "/home/marketing/campaigns"],
    ["email-templates", "Email templates", "/home/marketing/templates"],
    ["payouts", "Payouts", "/home/payouts"],
    ["reports", "Analytics", "/home/analytics"],
    ["inbox-whatsapp-catalog", "WhatsApp catalog", "/home/inbox/whatsapp-catalog"],
    ["dropship-orders", "Dropship orders", "/supplier/orders"],
    ["wholesale-orders", "Wholesale orders", "/supplier/wholesale"],
    ["quote-requests", "Quote requests", "/supplier/quote-requests"],
  ]) {
    assert.match(nav, new RegExp(`id: "${id}", label: "${label}",[^}]*href: "${href.replace(/\//g, "\\/")}"`), id);
  }
  assert.doesNotMatch(nav, /label: "(?:Web address|Sell without stock|Money sent to your bank|Groups of customers|Messages to customers|How your shop is doing|Price requests|How many you have|Payment page|Show up on Google|How your shop looks|Email designs|Bulk orders|Orders shops sold for you)"/);
});

test("every seller and supplier page header has a labelled Help button that opens the one help panel", () => {
  assert.match(read("src/components/seller/SellerPage.tsx"), /<HelpButton \/>/);
  assert.match(read("src/components/app-kit/index.tsx"), /frame\.role === "seller" \|\| frame\.role === "supplier" \? <>\{actions\}<HelpButton \/><\/>/);
  const help = read("src/components/simple/HelpButton.tsx");
  // The label is "Help" in English, shown in the person's language (shared/i18n "common" catalog).
  assert.match(help, /<Icon name="chat" size=\{16\} \/> \{t\("help"\)\}/);
  assert.match(read("shared/i18n/messages/common/en.ts"), /help: "Help",/);
  assert.match(read("src/components/shell/Sidebar.tsx"), /window\.addEventListener\(OPEN_HELP_EVENT, open\)/);
});
