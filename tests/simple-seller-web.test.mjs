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

test("domain, channels and WhatsApp catalog offer 'Ask us to set it up' and fold the technical details", () => {
  const connect = read("src/app/home/domain/DomainConnect.tsx");
  const ownership = read("src/components/domains/DomainOwnership.tsx");
  assert.match(connect, /<SetupHelpRequest/);
  assert.match(connect, /Use your own domain/);
  assert.match(connect, /Buy a new one/);
  assert.match(connect, /\.\.\.\(configured \?/, "buying only shows when the purchase flow is on");
  assert.match(connect, /I already have one/);
  assert.match(connect, /Ask the Shopinbos team to do it/);
  assert.match(ownership, /<SetupHelpRequest/);
  assert.match(ownership, /whatsappShareUrl\(message\)/);
  assert.match(ownership, /Copy the steps/);
  assert.match(ownership, /Waiting for your domain to be connected/);
  assert.match(ownership, /<Pill tone="success" dot>Connected<\/Pill>/);
  assert.match(ownership, /<TechFold forWho="the person who set up your domain"/);
  // Records and Verify are inside the fold.
  const fold = ownership.slice(ownership.indexOf('<TechFold forWho="the person who set up your domain" className="mt-4">'));
  assert.match(fold.slice(0, fold.indexOf("</TechFold>")), /<RecordList records=\{records\} \/>[\s\S]*>Verify</);
  assert.match(read("src/components/simple/Fold.tsx"), /Show the technical details \(for \$\{forWho\}\)/);

  const channels = read("src/app/channels/page.tsx");
  assert.match(channels, /<SetupHelpRequest/);
  assert.match(channels, /Show my products on Facebook and Instagram/);
  assert.match(channels, /<TechFold forWho=\{`the person who manages your \$\{channel\.account\} account`\}>/);
  // Feed links and the Meta token form only appear inside the technical fold.
  const before = channels.slice(0, channels.indexOf("<TechFold"));
  assert.doesNotMatch(before, /<CopyField|<MetaConnectForm/);

  const catalog = read("src/app/home/inbox/whatsapp-catalog/WhatsAppCatalogClient.tsx");
  assert.match(catalog, /<SetupHelpRequest/);
  assert.match(catalog, /<TechFold forWho="the person who manages your Facebook account">/);
  const catalogTop = catalog.slice(0, catalog.indexOf("<TechFold"));
  assert.doesNotMatch(catalogTop, /<CopyRow|rotate_token|catalog_management<\/b>/);
  assert.match(catalog, /plainMetaError/);
});

test("the WhatsApp steps message carries every record and opens a WhatsApp share link", async () => {
  const { setupStepsMessage, whatsappShareUrl } = await import("../src/components/domains/steps.ts");
  const records = [
    { purpose: "verify", type: "TXT", name: "_shopinbos-verify.adas.ng", label: "_shopinbos-verify", value: "shopinbos-verify=abc", required: true, note: "" },
    { purpose: "route", type: "CNAME", name: "www.adas.ng", label: "www", value: "cname.vercel-dns.com", required: true, note: "" },
  ];
  const message = setupStepsMessage("www.adas.ng", records);
  assert.match(message, /www\.adas\.ng/);
  assert.match(message, /TXT record \(proves we own it\)\n {3}Name: _shopinbos-verify\n {3}Value: shopinbos-verify=abc/);
  assert.match(message, /CNAME record \(required\)\n {3}Name: www\n {3}Value: cname\.vercel-dns\.com/);
  const url = whatsappShareUrl(message);
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), message);
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
  assert.match(read("src/app/home/marketing/whatsapp/WhatsAppTemplates.tsx"), /WhatsApp said no: /);
  const editor = read("src/app/home/marketing/whatsapp/WhatsAppTemplates.tsx");
  assert.match(editor, /label: "Promotion" \}, \{ value: "UTILITY", label: "Order update" \}/);
  assert.doesNotMatch(editor.slice(0, editor.indexOf("<AdvancedFold")), /Add variable|font-mono/);
});

test("the HTML email editor is an advanced option; the visual builder is the default", () => {
  for (const file of ["src/app/home/marketing/_kit/EmailBuilder.tsx", "src/app/home/marketing/_kit/EmailComposer.tsx"]) {
    const src = read(file);
    assert.match(src, /<AdvancedFold label="Advanced \(optional\): write the email in HTML code"/, file);
    assert.match(src, /useState<"visual" \| "html">\(initial \|\| !(?:content\.bodyHtml|value)\.trim\(\) \? "visual" : "html"\)/, file);
    assert.doesNotMatch(src, /label: "HTML" \}/, file);
  }
});

test("supplier orders are grouped New, To pack and Sent, with 'You get ₦X' and one big Accept", () => {
  const orders = read("src/app/supplier/orders/page.tsx");
  assert.match(orders, /\{ key: "new", label: "New", wholesale: \["pending"\], dropship: \["pending"\] \}/);
  assert.match(orders, /\{ key: "to-pack", label: "To pack"/);
  assert.match(orders, /\{ key: "sent", label: "Sent"/);
  assert.match(orders, /const LEGACY_FILTER[^\n]*"to-ship": "to-pack"/, "old ?status= links still work");
  assert.match(orders, /GROUPS\.map\(\(group\)/);
  assert.equal((orders.match(/>You get</g) ?? []).length, 2, "both kinds of order show what the supplier gets");
  assert.match(orders, /buttonClass\.ink\} min-h-\[52px\][^>]*><Icon name="check" size=\{16\} \/> Accept</);
  assert.match(orders, /Pack it with \{order\.shop\}&apos;s label/);
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
  assert.match(read("src/components/app-kit/index.tsx"), /frame\.role === "seller" \|\| frame\.role === "supplier" \? \(\s*<>\{actions\}<LearnPill role=\{frame\.role\} \/><HelpButton \/><\/>/);
  const help = read("src/components/simple/HelpButton.tsx");
  // The label is "Help" in English, shown in the person's language (shared/i18n "common" catalog).
  assert.match(help, /<Icon name="chat" size=\{16\} \/> \{t\("help"\)\}/);
  assert.match(read("shared/i18n/messages/common/en.ts"), /help: "Help",/);
  assert.match(read("src/components/shell/Sidebar.tsx"), /window\.addEventListener\(OPEN_HELP_EVENT, open\)/);
});
