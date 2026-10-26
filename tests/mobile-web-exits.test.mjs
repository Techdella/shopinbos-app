// Every page in the phone app stays in the phone app. Only advanced or paid tools open the website, and the button or
// row says so with "Opens website ↗" (apps/mobile/src/components/WebBadge.tsx). This file fails when an openWeb( call
// in apps/mobile/src has no WebBadge / WebButtonLabel beside it, unless it is on the allow-list below with a reason.
// It also checks the screens that used to send suppliers and delivery partners to the web are now in the app.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const app = (path) => read(`apps/mobile/src/${path}`);
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

/** How close (in lines) the badge must be to the openWeb( call: the same button, row or footer. */
const NEAR = 4;
const BADGE = /<WebBadge\b|<WebButtonLabel\b|"web\.badge"/;

/**
 * openWeb( calls that may stand without a badge next to them. `line` is part of the line's text (lines move, words
 * stay). Keep the reason honest: each one is either badged further away or owned by another piece of work.
 */
const ALLOWED = [
  { file: "lib/web.ts", line: "export async function openWeb(", reason: "the function itself" },
  { file: "lib/web.ts", line: "onPress: () => void openWeb(path)", reason: "openPath's fallback asks first; the Alert button reads web.badge" },
  { file: "app/channels.tsx", line: "await openWeb(GMAIL_CONNECT_PATH)", reason: "Google's sign-in; the Gmail button below renders <WebButtonLabel>" },
  { file: "app/video/studio.tsx", line: "await openWeb(webStudioPath(id))", reason: "the final render; the footer button renders <WebButtonLabel>" },
  { file: "app/templates.tsx", line: "openWeb(`/s/${encodeURIComponent(done.slug)}/preview`)", reason: "store looks and publishing are being rebuilt by another agent (left as is, listed in the report)" },
  { file: "app/templates.tsx", line: "openWeb(PLANS_PATH)", reason: "plans and billing (paid); templates.tsx is owned by the store-editing agent (listed in the report)" },
];

const mobileSrc = join(root, "apps/mobile/src");

test("every openWeb( call shows \"Opens website ↗\" or is allow-listed with a reason", () => {
  const missing = [];
  const used = new Set();
  for (const path of sources(mobileSrc)) {
    const file = relative(mobileSrc, path).split("\\").join("/");
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((text, index) => {
      if (!text.includes("openWeb(") || /^\s*(\/\/|\*)/.test(text)) return;
      const allowed = ALLOWED.find((entry) => entry.file === file && text.includes(entry.line));
      if (allowed) {
        used.add(allowed);
        return;
      }
      const near = lines.slice(Math.max(0, index - NEAR), index + NEAR + 1).join("\n");
      if (!BADGE.test(near)) missing.push(`${file}:${index + 1}: ${text.trim()}`);
    });
  }
  assert.deepEqual(missing, [], "add <WebBadge /> or <WebButtonLabel> to these, or bring them into the app");
  for (const entry of ALLOWED) {
    assert.ok(entry.reason.length > 10, `${entry.file}: give a reason`);
    assert.ok(used.has(entry), `stale allow-list entry: ${entry.file} "${entry.line}"`);
  }
});

test("the badge says \"Opens website ↗\" in every language", () => {
  const badge = app("components/WebBadge.tsx");
  assert.match(badge, /export function WebBadge/);
  assert.match(badge, /export function WebButtonLabel/);
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const words = CATALOGS.m_ui[locale]?.["web.badge"];
    assert.ok(words && words.includes("↗"), `${locale} m_ui web.badge`);
  }
});

test("openPath asks before a link the app has no screen for opens the website", () => {
  const web = app("lib/web.ts");
  assert.match(web, /Alert\.alert\(t\("web\.askTitle"\), t\("web\.askBody"\)/);
  assert.doesNotMatch(web, /\n  return openWeb\(path\);\n\}/, "no silent fall-through to the website");
});

test("no menu sends people to the web app: \"app:\" screens, public pages and mail only", () => {
  for (const file of ["components/PartnerMore.tsx", "app/logistics/(tabs)/more.tsx"]) {
    const source = app(file);
    assert.doesNotMatch(source, /openWeb|path: "\/(logistics|supplier)\//, file);
  }
  assert.match(app("app/logistics/(tabs)/more.tsx"), /"app:\/logistics\/quotes"/);
  // The old orphan /logistics/menu screen is gone; Business (more.tsx) has every row.
  assert.ok(!existsSync(join(root, "apps/mobile/src/components/LogisticsMenu.tsx")));
  assert.ok(!existsSync(join(root, "apps/mobile/src/app/logistics/menu.tsx")));
});

test("supplier account: team, price tiers, profile and notifications open screens in the app", () => {
  const account = app("app/supplier/account.tsx");
  assert.doesNotMatch(account, /openWeb/);
  for (const path of ["/supplier/team", "/supplier/tiers", "/supplier/profile", "/notifications/settings"]) assert.ok(account.includes(`router.push("${path}")`), path);
  for (const screen of ["app/supplier/team.tsx", "app/supplier/tiers.tsx", "app/supplier/profile.tsx", "app/supplier/product/edit.tsx"]) assert.ok(existsSync(join(mobileSrc, screen)), screen);

  const team = read("src/app/api/mobile/supplier/team/route.ts");
  assert.match(team, /export const GET = withSupplier/);
  assert.match(team, /export const POST = withSupplier/);
  assert.match(team, /atLimit\(active, limit\)/, "the plan's team limit holds");
  const member = read("src/app/api/mobile/supplier/team/[id]/route.ts");
  assert.match(member, /export const PATCH = withSupplier/);
  assert.match(member, /export const DELETE = withSupplier/);
  assert.match(member, /supplierId: supplier\.id/, "only the supplier's own people");

  const product = app("app/supplier/product/[id].tsx");
  assert.doesNotMatch(product, /openWeb/);
  assert.match(product, /pathname: "\/supplier\/product\/edit", params: \{ id: data\.id, focus: "tiers" \}/);
  const edit = app("app/supplier/product/edit.tsx");
  assert.match(edit, /editSupplierProduct\(/);
  assert.match(edit, /pricingTiers: priced/);
  assert.match(app("lib/supplier.ts"), /`\/api\/supplier\/products\/\$\{encodeURIComponent\(id\)\}`, \{ method: "PATCH"/);
  assert.match(read("src/app/api/supplier/products/route.ts"), /pricingTiers: true/, "the list carries the tiers");
});

test("delivery partners: price requests and removing a rider are in the app", () => {
  const jobs = app("app/logistics/(tabs)/jobs.tsx");
  assert.doesNotMatch(jobs, /openWeb/);
  assert.match(jobs, /router\.push\("\/logistics\/quotes"\)/);
  const quotes = app("app/logistics/quotes.tsx");
  assert.match(quotes, /fetchPriceRequests/);
  assert.match(quotes, /answerPriceRequest\(request\.id/);
  const list = read("src/app/api/mobile/logistics/quotes/route.ts");
  assert.match(list, /export const GET = withLogistics/);
  assert.match(list, /logisticsPartnerId: partner\.id/);
  const answer = read("src/app/api/mobile/logistics/quotes/[id]/route.ts");
  assert.match(answer, /replyToQuote\(/, "same rules as the web form");
  assert.match(answer, /verificationStatus !== "verified"/);

  const rider = app("app/logistics/team/[id].tsx");
  assert.doesNotMatch(rider, /openWeb/);
  assert.match(rider, /setRiderActive\(String\(id\), active\)/);
  const route = read("src/app/api/mobile/logistics/riders/[id]/route.ts");
  assert.match(route, /export const PATCH = withLogistics/);
  assert.match(route, /riderTokenHash: null/, "a removed rider's link stops working");
  assert.match(route, /logisticsPartnerId: partner\.id/);
});

test("verification documents upload from the phone; add-city opens the app's settings", () => {
  const verify = app("components/VerificationScreen.tsx");
  assert.doesNotMatch(verify, /openWeb/);
  assert.match(verify, /\$\{base\}\/upload/);
  assert.match(verify, /\$\{base\}\/submit/);
  const trust = app("components/SupplierTrust.tsx");
  assert.doesNotMatch(trust, /openWeb/);
  assert.match(trust, /router\.push\("\/settings"\)/);
});

test("what stays on the website carries the badge: buying a domain, the video render, admin, Gmail and WhatsApp sign-up", () => {
  assert.match(app("app/domain.tsx"), /right=\{<WebBadge \/>\} onPress=\{\(\) => void openWeb\("\/home\/domain"\)\}/);
  assert.match(app("app/video/studio.tsx"), /<WebButtonLabel title=\{t\("finish\.button"\)\} \/>/);
  assert.match(app("app/web-only.tsx"), /<WebButtonLabel title="Open the admin panel" \/>/);
  const channels = app("app/channels.tsx");
  assert.match(channels, /text: tWeb\("web\.badge"\), onPress: \(\) => void openWeb\("\/channels"\)/);
  assert.match(channels, /<WebButtonLabel title=\{usingGmail \|\| view\.gmail/);
  assert.match(app("components/familiar/StoryViewer.tsx"), /post\.cta\.kind === "view_shop" \? <WebButtonLabel/);
});
