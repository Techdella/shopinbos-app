// Simplicity rules (build spec section 8A) for the seller web app and the supplier web portal: user-facing text
// uses the plain word list, technical setup is folded away or swapped for "we'll set it up for you"
// (SetupHelpRequest), and the friendly WhatsApp message helpers round-trip.
//
// The scanner reads JSX text and the string props people read (title, sub, label, placeholder, hint, …) plus
// messages passed to setError/setNotice/toasts. It skips code identifiers, routes, className strings, comments
// and anything inside <TechFold> / <AdvancedFold> ("Show the technical details (for …)" / "Advanced (optional)").
// Run with SIMPLE_WORDS_REPORT=1 to print every hit.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");

// ─── Which files ──────────────────────────────────────────────────────────────

const SELLER_DIRS = ["src/app/home", "src/app/marketplace", "src/app/channels", "src/app/builder", "src/app/studio", "src/app/products", "src/app/seller"];
const SUPPLIER_DIRS = ["src/app/supplier"];
// Seller- and supplier-facing component folders (storefront/cms render for shoppers; logistics, admin, support,
// ops and rider belong to other portals).
const COMPONENT_DIRS = [
  "src/components/seller",
  "src/components/seller-core",
  "src/components/seller-settings",
  "src/components/domains",
  "src/components/builder",
  "src/components/marketplace",
  "src/components/supplier",
  "src/components/growth",
  "src/components/simple",
  "src/components/payments",
  "src/components/billing",
  "src/components/onboarding",
  "src/components/settings",
];

function walk(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const path = join(abs, name);
    if (statSync(path).isDirectory()) out.push(...walk(relative(ROOT, path)));
    else if (name.endsWith(".tsx")) out.push(relative(ROOT, path));
  }
  return out;
}

// ─── Words ────────────────────────────────────────────────────────────────────

const SELLER_BANNED = [
  ["domain", /\bdomains?\b/i],
  ["DNS", /\bDNS\b/],
  ["CNAME", /\bCNAME\b/i],
  ["SSL", /\bSSL\b/],
  ["SKU", /\bSKUs?\b/i],
  ["variant", /\bvariants?\b/i],
  ["inventory", /\binventory\b/i],
  ["fulfil", /\bfulfil+(?:ment|led|ling|s)?\b/i],
  ["dropship", /\bdrop-?ship(?:ping|per|pers|ped)?\b/i],
  ["COD", /\bCOD\b/],
  ["cash on delivery", /\bcash on delivery\b/i],
  ["payout", /\bpay-?outs?\b/i],
  ["settlement", /\bsettlements?\b/i],
  ["escrow", /\bescrow\b/i],
  ["balance held", /\bbalance held\b/i],
  ["checkout", /\bcheck-?out\b/i],
  ["cart abandonment", /\b(?:cart abandonment|abandoned carts?)\b/i],
  ["integration", /\bintegrations?\b/i],
  ["API", /\bAPI\b/],
  ["webhook", /\bwebhooks?\b/i],
  ["campaign", /\bcampaigns?\b/i],
  ["CTR", /\bCTR\b/],
  ["ROAS", /\bROAS\b/],
  ["budget", /\bbudgets?\b/i],
  ["segment", /\bsegments?\b/i],
  ["audience", /\baudiences?\b/i],
  ["analytics", /\banalytics\b/i],
  ["dashboard", /\bdashboards?\b/i],
  ["theme", /\bthemes?\b/i],
  ["template", /\btemplates?\b/i],
  ["error", /\berrors?\b/i],
  ["failed", /\bfailed\b/i],
  ["invalid", /\binvalid\b/i],
];
const SUPPLIER_EXTRA = [
  ["white label", /\bwhite[- ]label(?:ed|ing)?\b/i],
  ["quote", /\bquotes?\b/i],
];

// Hits that are fine where they are (file → words). Keep this short and say why.
const ALLOW = {
  // The supplier help article names words sellers may hear elsewhere; none so far.
};

// ─── Extracting what people read ──────────────────────────────────────────────

const TEXT_PROPS = "title|sub|label|placeholder|hint|description|aria-label|summary|alt|eyebrow|subtitle|heading|cta|empty|emptyText|confirmLabel|helper|caption";

// What text between ">" and "<" looks like when it is TypeScript (generics, comparisons), not JSX text.
const CODE = /^[\w.]+\s*(?:=>|\()|[;=]\s*$|&&|\|\||=>|===|!==|\b(?:const|let|return|useState|useRef|Array|Record|Promise|void|typeof)\b|\);|\?\s*\\?["'`]|\w\??:\s*(?:string|number|boolean)\b|^\(|\)$/;

/** Removes folded technical/advanced sections, comments and className strings, then returns the readable bits. */
export function readableText(source) {
  let src = source;
  // Folded sections: the technical person or "Advanced (optional)" may use technical words.
  for (const tag of ["TechFold", "AdvancedFold"]) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "g");
    src = src.replace(re, "");
  }
  src = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  src = src.replace(/className=(?:"[^"]*"|\{[^}]*\})/g, "");
  const bits = [];
  // JSX text between tags (no braces or angle brackets inside).
  for (const m of src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    const text = m[1].trim();
    if (text && !CODE.test(text)) bits.push(text);
  }
  // String props people read.
  for (const m of src.matchAll(new RegExp(`\\b(?:${TEXT_PROPS})=(?:"([^"]*)"|\\{\\s*["\`]([^"\`]*)["\`]\\s*\\})`, "g"))) bits.push(m[1] ?? m[2]);
  // Object literals used as copy: { label: "…", sub: "…", title: "…", desc: "…" }.
  for (const m of src.matchAll(/\b(?:label|sub|title|desc|description|hint|blurb|placeholder|body|message|text|cta|empty)\s*:\s*(["`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) bits.push(m[2]);
  // Messages shown to people.
  for (const m of src.matchAll(/\b(?:setError|setNotice|setMessage|setToast|setClaimError|setVerifyError|setSearchError|setPurchaseError|toast(?:\.\w+)?|notify|setInfo|setWarning|alert|confirm)\(\s*(["`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) bits.push(m[2]);
  for (const m of src.matchAll(/new Error\(\s*(["`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) bits.push(m[2]);
  return bits
    .map((bit) => bit.replace(/\$\{[^}]*\}/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"'))
    // Routes, URLs and identifiers are not words people read.
    .map((bit) => bit.replace(/(?:https?:\/\/|\/)[\w./?=&#%-]+/g, " "))
    .filter((bit) => /[A-Za-z]{2}/.test(bit));
}

function hits(files, banned) {
  const found = [];
  for (const file of files) {
    const allowed = new Set(ALLOW[file] ?? []);
    for (const text of readableText(read(file))) {
      for (const [word, re] of banned) {
        if (!allowed.has(word) && re.test(text)) found.push(`${file}: "${word}" in ${JSON.stringify(text.slice(0, 140))}`);
      }
    }
  }
  return found;
}

const sellerFiles = [...SELLER_DIRS, ...COMPONENT_DIRS].flatMap(walk);
const supplierFiles = SUPPLIER_DIRS.flatMap(walk);

test("the scanner reads JSX text and labels, and skips folds, routes and class names", () => {
  const sample = `
    <Card title="Your domain" className="checkout-panel">
      <p>Connect your payout account</p>
      <Link href="/home/campaigns">Open</Link>
      <TechFold forWho="x"><p>Add these DNS records</p></TechFold>
      {/* the webhook is internal */}
    </Card>`;
  const text = readableText(sample).join(" | ");
  assert.match(text, /Your domain/);
  assert.match(text, /payout account/);
  assert.doesNotMatch(text, /DNS|campaigns|checkout|webhook/);
});

test("seller web UI uses the plain word list (section 8A)", () => {
  const found = hits(sellerFiles, SELLER_BANNED);
  if (process.env.SIMPLE_WORDS_REPORT) console.log(found.join("\n"));
  assert.ok(sellerFiles.length > 50, "found the seller files");
  assert.deepEqual(found, []);
});

test("supplier web UI uses the plain word list, plus no dropship, white label, escrow or quote", () => {
  const found = hits(supplierFiles, [...SELLER_BANNED, ...SUPPLIER_EXTRA]);
  if (process.env.SIMPLE_WORDS_REPORT) console.log(found.join("\n"));
  assert.ok(supplierFiles.length > 5, "found the supplier files");
  assert.deepEqual(found, []);
});

// ─── "We'll set it up for you" ────────────────────────────────────────────────

test("web address, channels and WhatsApp catalog offer 'Ask us to set it up' and fold the technical details", () => {
  const connect = read("src/app/home/domain/DomainConnect.tsx");
  const ownership = read("src/components/domains/DomainOwnership.tsx");
  assert.match(connect, /<SetupHelpRequest/);
  assert.match(connect, /Use your own web address/);
  assert.match(connect, /Buy a new one/);
  assert.match(connect, /\.\.\.\(configured \?/, "buying only shows when the purchase flow is on");
  assert.match(connect, /I already have one/);
  assert.match(connect, /Ask the Shopinbos team to do it/);
  assert.match(ownership, /<SetupHelpRequest/);
  assert.match(ownership, /whatsappShareUrl\(message\)/);
  assert.match(ownership, /Copy the steps/);
  assert.match(ownership, /Waiting for your web address to be connected/);
  assert.match(ownership, /<Pill tone="success" dot>Connected<\/Pill>/);
  assert.match(ownership, /<TechFold forWho="the person who set up your web address"/);
  // Records and Verify are inside the fold.
  const fold = ownership.slice(ownership.indexOf('<TechFold forWho="the person who set up your web address" className="mt-4">'));
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
