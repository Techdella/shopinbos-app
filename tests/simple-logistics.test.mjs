// Delivery partners never see developer settings (owner: "On the logistics app, I don't want to see API codes").
// Partner-facing pages and the partner / rider mobile screens must not show API keys, webhooks or other developer
// words; "Connect your system" is a request form instead, and admins manage keys on the partner's admin page.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

function files(dir) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return files(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

/** The words a person can see: string literals and JSX text, with comments and imports dropped. */
function uiStrings(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^import .*$/gm, "");
  const strings = [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
  const jsxText = [...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  return [...strings, ...jsxText].join("\n");
}

const PARTNER_UI = [
  ...files("src/app/logistics"),
  ...files("src/components/logistics"),
  ...files("apps/mobile/src/app/logistics"),
  ...files("apps/mobile/src/app/rider"),
  "apps/mobile/src/components/LogisticsMenu.tsx",
  "apps/mobile/src/components/JobCard.tsx",
  "apps/mobile/src/components/SetupHelpRequest.tsx",
  "apps/mobile/src/lib/rider-strings.ts",
  // Web partner and rider words live in the app-language catalogs.
  "shared/i18n/messages/logistics/en.ts",
  "shared/i18n/messages/rider/en.ts",
];

const BANNED = [/API key/i, /webhook/i, /sk_live/i, /sk_test/i, /sandbox/i, /endpoint/i];

test("partner and rider screens show no developer words", () => {
  assert.ok(PARTNER_UI.length > 30, "found the partner screens");
  for (const file of PARTNER_UI) {
    const ui = uiStrings(read(file));
    for (const word of BANNED) assert.doesNotMatch(ui, word, `${file} shows ${word}`);
  }
});

test("the old key and webhook panels are gone from the partner portal", () => {
  assert.ok(!existsSync(join(root, "src/app/logistics/connect/ConnectClient.tsx")));
  for (const file of files("src/app/logistics")) {
    const source = read(file);
    assert.doesNotMatch(source, /partnerApiKey|partnerWebhook|ApiKeysPanel|WebhooksPanel|createApiKeyAction/, file);
  }
});

test("Connect your system is a request to the team, on the web and in the app", () => {
  const web = read("src/app/logistics/connect/page.tsx");
  // The words are in the logistics catalog (shared/i18n/messages/logistics/en.ts), shown through t().
  const webWords = read("shared/i18n/messages/logistics/en.ts");
  assert.match(web, /import \{ SetupHelpRequest \} from "@\/components\/support\/SetupHelpRequest"/);
  assert.match(web, /<SetupHelpRequest/);
  assert.match(web, /feature="logistics_api"/);
  assert.match(web, /title=\{t\("connect\.helpTitle"\)\}/);
  assert.match(webWords, /"connect\.helpTitle": "Connect your delivery software"/);
  assert.match(web, /sub=\{t\("connect\.sub"\)\}/);
  assert.match(webWords, /Already use delivery software\? Our team can connect it to Shopinbos for you, so jobs show up there automatically\./);

  const mobile = read("apps/mobile/src/app/logistics/connect.tsx");
  assert.match(mobile, /<SetupHelpRequest/);
  assert.match(mobile, /feature="logistics_api"/);
  // The phone menu reads its words from the app-language catalog (m_partner "menu.connect").
  assert.match(read("apps/mobile/src/components/LogisticsMenu.tsx"), /key: "connect", icon: "send", path: "app:\/logistics\/connect"/);
  assert.match(read("shared/i18n/messages/m_partner/en.ts"), /"menu\.connect": "Connect your system"/);

  const component = read("apps/mobile/src/components/SetupHelpRequest.tsx");
  for (const prop of ["title", "description", "feature", "softwareQuestion?", "softwarePlaceholder?"]) assert.ok(component.includes(`${prop}:`), `mobile prop ${prop}`);
  assert.match(component, /\/api\/support\/tickets/);
  assert.match(component, /topic: "setup"/);

  const nav = read("src/lib/nav.ts");
  assert.match(nav, /label: "Connect your system".*href: "\/logistics\/connect"/);
});

test("only admins issue, rotate and revoke partner keys", () => {
  const actions = read("src/app/actions/partner-api.ts");
  assert.match(actions, /requireRole\(\["admin"\]/);
  assert.doesNotMatch(actions, /requireRole\(\["logistics_partner"\]/);
  for (const name of ["createApiKeyAction", "rotateApiKeyAction", "revokeApiKeyAction"]) assert.match(actions, new RegExp(`export async function ${name}`));

  const page = read("src/app/admin/logistics-partners/[id]/page.tsx");
  assert.match(page, /ApiKeysPanel/);
  const panel = read("src/app/admin/logistics-partners/[id]/PartnerConnection.tsx");
  assert.match(panel, /rotateApiKeyAction/);
  assert.match(panel, /shown once/i);
  assert.match(panel, /key\.prefix\}…/);
  // The partner API itself stays.
  assert.ok(existsSync(join(root, "src/app/api/v1/partner/jobs/route.ts")));
});

test("partner app: four tabs (Jobs, Chats, Money, Business), and the Riders app speaks English, Pidgin, Yorùbá, Hausa or Igbo from one catalog", () => {
  const tabs = read("apps/mobile/src/app/logistics/(tabs)/_layout.tsx");
  const items = tabs.slice(tabs.indexOf("const ITEMS"), tabs.indexOf("};", tabs.indexOf("const ITEMS")));
  assert.deepEqual([...items.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]), ["Jobs", "Chats", "Money", "Business"]);

  const strings = read("apps/mobile/src/lib/rider-strings.ts");
  assert.match(strings, /code: "pcm", label: "Pidgin"/);
  for (const code of ["en", "yo", "ha", "ig"]) assert.match(strings, new RegExp(`code: "${code}"`), code);
  // The words live in the app-language catalog (shared/i18n/messages/m_rider), read through rider-strings.ts.
  assert.match(strings, /tFor\(locale, "m_rider"\)/);
  const words = read("shared/i18n/messages/m_rider/en.ts");
  for (const line of ["Take this delivery", "I have the parcel", "I'm with the customer", "I collected it", "Delivered", "Cash with you"]) assert.ok(words.includes(`"${line}"`), line);
  const rider = read("apps/mobile/src/app/rider/(tabs)/index.tsx");
  assert.match(rider, /minHeight: 64/);
  assert.match(rider, /useRiderStrings/);
});

test("partner app, Familiar design: Jobs has the level ring, Peggy, Status and route cards; Money goes straight to the bank", () => {
  const jobs = read("apps/mobile/src/app/logistics/(tabs)/jobs.tsx");
  for (const piece of ["<LevelPill", "<PeggyButton", "<NotificationBellButton", "<StatusRow", "<Checklist", "<RouteCard", "<PushPromptCard", "<PayInOverdueCard"]) assert.ok(jobs.includes(piece), piece);
  assert.match(jobs, /"\/rewards"/);
  assert.match(jobs, /"\/ask-peggy"/);
  // No pending total in the API: the dark card says what was earned this week, not "coming to your bank".
  assert.match(jobs, /t\("fam\.sum\.week"\)/);
  // Delivery fees settle to the partner's own bank: no balance to withdraw, no PIN, no "held by" copy (comments aside).
  const money = read("apps/mobile/src/app/logistics/(tabs)/earnings.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(money, /withdraw|\bpin\b|held by/i);
  const words = read("shared/i18n/messages/m_partner/en.ts");
  assert.doesNotMatch(words.slice(words.indexOf('"fam.')), /withdraw|held by/i);
  // Credits are shown; "Top up" only emails how to do it on the website (no sale in the app).
  assert.match(read("apps/mobile/src/app/logistics/(tabs)/more.tsx"), /emailTopUp\(\)/);
  assert.match(read("apps/mobile/src/app/logistics/(tabs)/messages.tsx"), /filters/);
  // Android: the active tab icon sits on the prototype's teal pill.
  assert.match(read("apps/mobile/src/app/logistics/(tabs)/_layout.tsx"), /tint=\{PARTNER_TINT\}/);
  assert.match(read("apps/mobile/src/components/PartnerKit.tsx"), /PARTNER_TINT = "#D6F0E9"/);
});
