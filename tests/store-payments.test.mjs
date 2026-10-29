// App store payment rules for the phone app (Google Play Payments policy; Apple App Store Review Guidelines 3.1.1 and
// 3.1.3). docs/store-payments-audit.md has the audit. The phone app may take Paystack payments for physical goods,
// real-world services and money between businesses, but it never sells AI credits, plans, themes or wallet top-ups,
// and never points anywhere to buy them: no button, link, price, "on the website" or "we'll email you how".
// These tests fail when a purchase call to action for those comes back into apps/mobile/src or the m_* catalogs.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const rules = await import("../shared/store-payments.ts");
const { CATALOGS, NAMESPACES } = await import("../shared/i18n/catalog.ts");

const mobileSrc = join(root, "apps/mobile/src");
function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}
const FILES = sources(mobileSrc).map((path) => ({ file: relative(mobileSrc, path).split("\\").join("/"), text: readFileSync(path, "utf8") }));
/** Source without comments, so explanations of the rules don't trip the scan. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/**
 * Words that may stay although they look like the pattern. Each entry says why it isn't a call to buy a digital
 * Shopinbos product. Keep it short and honest.
 */
const ALLOWED_PHRASES = [
  { where: "components/WalletAccountNumber.tsx", text: "view.topUpAccount", reason: "API field names for the business's own account number; only shown when EXPO_PUBLIC_WALLET_ACCOUNT_NUMBER is on (never in store builds), and money paid in settles to their own bank" },
  { where: "lib/wallet.ts", text: "topUpAccount", reason: "a field of the web's wallet API type; never shown (the card has no Top up)" },
  { where: "lib/wallet.ts", text: "topUpMin", reason: "a field of the web's wallet API type; never shown" },
  { where: "app/invoices/new.tsx", text: "billing@example.com", reason: "an email placeholder for the customer an invoice goes to" },
];

test("the rules: purchase pages, plan gates and purchase words are recognised", () => {
  for (const path of ["/home/credits", "/supplier/credits?pack=medium", "/logistics/credits", "/logistics/billing", "/home/settings?tab=Billing", "/supplier/settings?tab=billing", "/pricing", "https://app.shopinbos.com/home/credits", "/home/wallet?tab=topup"]) {
    assert.equal(rules.isDigitalPurchasePath(path), true, path);
  }
  for (const path of ["/home", "/home/orders/abc", "/home/settings", "/home/wallet", "/home/domain", "/logistics/pricing", "/register-business", "/home/labels/packaging", "app:/rewards"]) {
    assert.equal(rules.isDigitalPurchasePath(path), false, path);
  }
  assert.equal(rules.storeSafeKind("AI_CREDITS_NEEDED", 402, "This needs 10 AI credits and you have 2. Top up to carry on."), "credits");
  assert.equal(rules.storeSafeKind("PLAN_LIMIT", 402, "Your plan includes up to 10 products. Upgrade to Starter to add more."), "plan");
  assert.equal(rules.storeSafeKind("UPGRADE_REQUIRED", 403, "Only the Pro plan can hide the badge."), "plan");
  assert.equal(rules.storeSafeKind(undefined, 400, "Upgrade to Growth to cover more states."), "plan", "an upgrade line with no code");
  assert.equal(rules.storeSafeKind("BAD_REQUEST", 400, "Add a product name first."), null);
  assert.equal(rules.storeSafeKind("RATE_LIMITED", 429, "Wait a minute and try again."), null);
  assert.equal(rules.sellsDigitalGoods({ title: "12 AI credits left", description: "Top up so Rex can keep creating for you.", link: "/home/credits" }), true);
  assert.equal(rules.sellsDigitalGoods({ title: "New order", description: "Ada ordered 2 items", link: "/home/orders/1" }), false);
  assert.match(rules.IN_APP_PAYMENTS_RULE, /never tell the person to buy, top up, upgrade or subscribe/);
});

test("no purchase call to action in the phone app's code: credits, plans, themes and wallet top-ups", () => {
  const found = [];
  for (const { file, text } of FILES) {
    const lines = code(text).split("\n");
    lines.forEach((line, index) => {
      if (!rules.PURCHASE_CTA.test(line) && !/top-?up|topUp/i.test(line)) return;
      if (ALLOWED_PHRASES.some((entry) => entry.where === file && line.includes(entry.text))) return;
      found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, [], "take the purchase prompt out, or add an ALLOWED_PHRASES entry with an honest reason");
  for (const entry of ALLOWED_PHRASES) assert.ok(entry.reason.length > 15, `${entry.where}: give a reason`);
});

test("nothing in the app emails, links or opens a way to buy credits, plans, themes or a wallet top-up", () => {
  const all = FILES.map(({ file, text }) => ({ file, text: code(text) }));
  const forbidden = [
    [/emailTopUp|emailWalletTopUp|topup-email/, "the 'we'll email you how to top up' flow (it still steers to another way to pay)"],
    [/\/home\/credits|\/supplier\/credits|\/logistics\/credits|\/logistics\/billing|tab=Billing|PLANS_PATH|\/pricing\b/, "a purchase page of the website"],
    [/openWeb\("\/home\/domain"\)/, "buying a domain on the website"],
    [/creditsUrlFor|buyUrl|CREDIT_PACKS|creditPack|packKobo/, "credit packs or where to buy them"],
    [/initializePaystack|checkout\/plan|subscribeToPlan|buyTheme|buyCredits/, "a purchase of a digital product"],
  ];
  const hits = [];
  for (const { file, text } of all) for (const [pattern, what] of forbidden) if (pattern.test(text)) hits.push(`${file}: ${what}`);
  assert.deepEqual(hits, []);
});

test("the m_* catalogs have no purchase prompts for credits, plans, themes or top-ups (every language)", () => {
  const ALLOWED_KEYS = new Set([]);
  const hits = [];
  for (const ns of NAMESPACES.filter((name) => name.startsWith("m_"))) {
    for (const lang of ["en", "pcm"]) {
      for (const [key, value] of Object.entries(CATALOGS[ns][lang] ?? {})) {
        if (ALLOWED_KEYS.has(`${ns}.${key}`)) continue;
        if (rules.PURCHASE_CTA.test(String(value)) || /\btop[\s-]?up\b/i.test(String(value))) hits.push(`${ns} ${lang} ${key}: ${value}`);
      }
    }
    for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
      for (const [key, value] of Object.entries(CATALOGS[ns][lang] ?? {})) {
        // Websites and plans named next to a price or "credits" read as a purchase prompt in any language.
        if (/credits?/i.test(key) && /website|\bweb\b|email/i.test(String(value)) && lang === "en") hits.push(`${ns} ${lang} ${key}: ${value}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

test("words the app borrows from the web's catalogs carry no purchase prompt either", () => {
  const hits = [];
  for (const { file, text } of FILES) {
    const namespaces = [...text.matchAll(/useT\(([^)]*)\)/g)].flatMap((match) => [...match[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]));
    if (!namespaces.length) continue;
    for (const [, key] of code(text).matchAll(/\b\w+\("([\w.-]+)"/g)) {
      const ns = namespaces.find((name) => CATALOGS[name]?.en?.[key] !== undefined);
      if (!ns || ns.startsWith("m_")) continue;
      const value = String(CATALOGS[ns].en[key]);
      if (rules.PURCHASE_CTA.test(value) || /\btop[\s-]?up\b/i.test(value)) hits.push(`${file}: ${ns}.${key}: ${value}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("server messages: plan gates and running out of credits read calmly, with no purchase prompt", () => {
  const api = read("apps/mobile/src/lib/api.ts");
  assert.match(api, /storeSafeKind\(code, status, message\)/);
  assert.match(api, /kind === "credits"\) return tNow\("m_ui"\)\("error\.aiAllowance"\)/);
  assert.match(api, /kind === "plan"\) return tNow\("m_ui"\)\("error\.notOnPlan"\)/);
  assert.match(api, /\[APP_CLIENT_HEADER\]: APP_CLIENT_VALUE/, "every call says it's the phone app");
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    for (const key of ["error.aiAllowance", "error.notOnPlan", "credits.refill"]) assert.ok(CATALOGS.m_ui[lang][key], `m_ui ${lang} ${key}`);
  }
  assert.doesNotMatch(CATALOGS.m_ui.en["error.aiAllowance"], /buy|top|website|upgrade/i);
  // openPath and openWeb never open a purchase page, not even after "Open the website?".
  const web = read("apps/mobile/src/lib/web.ts");
  assert.match(web, /if \(isDigitalPurchasePath\(path\)\) return null;/);
  assert.match(web, /if \(isDigitalPurchasePath\(path\)\) return;\n  const t = tNow/);
  assert.match(read("apps/mobile/src/lib/notifications.ts"), /filter\(\(item\) => !sellsDigitalGoods\(item\)\)/);
});

test("the server keeps phone answers store-safe: Peggy and Rex, the credits note and no auto top-up from the app", () => {
  const peggy = read("src/app/api/mobile/peggy/route.ts");
  assert.match(peggy, /runPeggy\(\{ id: user\.id, phone: user\.phone \?\? null \}, parsed\.turns, \{ inApp: true \}\)/);
  assert.match(peggy, /\$\{IN_APP_PAYMENTS_RULE\}`/);
  assert.match(read("src/lib/ai/peggy/agent.ts"), /options\.inApp \? `\$\{base\}\\n\\n\$\{IN_APP_PAYMENTS_RULE\}`/);
  assert.match(read("src/app/api/ai/rex/route.ts"), /\{ inApp: isPhoneAppRequest\(req\.headers\) \}/);
  assert.match(read("src/lib/ai/rex/agent.ts"), /options\.inApp \? `\$\{withPreferences\}\\n\\n\$\{IN_APP_PAYMENTS_RULE\}`/);
  assert.doesNotMatch(read("src/lib/ai/rex/tools.ts").match(/new RexCreditsError\([^;]+;/)?.[0] ?? "", /top up|buy/i);
  assert.doesNotMatch(code(read("src/app/api/mobile/credits/route.ts")), /top up|website/i);
  assert.match(read("src/lib/ai/usage.ts"), /spendCredits\(userId, cost, \{ autoTopUp: !\(await fromPhoneApp\(\)\) \}\)/);
  assert.match(read("src/lib/ai/credits.server.ts"), /if \(left === null && options\.autoTopUp !== false\)/);
});

test("credits show as a number and a refill line only; the wallet card has no Top up", () => {
  for (const path of ["apps/mobile/src/components/familiar/Credits.tsx", "apps/mobile/src/app/rex.tsx", "apps/mobile/src/app/supplier/account.tsx", "apps/mobile/src/app/logistics/(tabs)/more.tsx"]) {
    const source = code(read(path));
    assert.match(source, /credits\.refill/, `${path} says credits refill monthly`);
    assert.doesNotMatch(source, /topUp|Top up|emailTopUp/i, path);
  }
  const credits = code(read("apps/mobile/src/components/familiar/Credits.tsx"));
  assert.doesNotMatch(credits, /Pressable|PillButton|onPress/, "the credits line is not a button");
  const card = code(read("apps/mobile/src/components/WalletBalanceCard.tsx"));
  assert.doesNotMatch(card, /topUp|bal\.topUp|emailWalletTopUp/);
  assert.doesNotMatch(card, /withdrawFromWallet/, "the balance is spend-only: no Withdraw");
});

test("themes: no lock while every theme is free, and a lock never names a plan or links to one", () => {
  const screen = code(read("apps/mobile/src/app/templates.tsx"));
  assert.match(screen, /lockedPlan: ALL_THEMES_FREE \|\| look\.id === currentId \? null : look\.lockedPlan/);
  assert.match(screen, /title=\{t\("notOnPlan"\)\} \/>/);
  assert.doesNotMatch(screen, /needsPlan|seePlans|themeTierPlanName|Tag label=\{look\.lockedPlan\}/);
  const onboarding = code(read("apps/mobile/src/app/onboarding/where.tsx"));
  assert.doesNotMatch(onboarding, /nationwidePlan|\{ plan \}/, "no plan name next to a locked choice");
});

test("domains: connecting one you own stays; buying one isn't in the app", () => {
  const screen = code(read("apps/mobile/src/app/domain.tsx"));
  assert.doesNotMatch(screen, /openWeb|WebBadge|canBuy|buy\.title/);
  assert.equal(CATALOGS.m_domain.en["buy.title"], undefined);
});

test("card payments in the app are only for real things and money between businesses, and say what they're for", () => {
  // Every payInApp( caller: physical goods, real-world services or business-to-business money (pay.ts).
  const ALLOWED_PAYMENTS = {
    "lib/wallet.ts": ["/api/mobile/logistics/sellers-cash/pay", "/pay-fee", "/api/app/wholesale/", "owedAction<StartedPayment>"],
    "lib/packaging.ts": ["/api/app/print-orders"],
    "lib/ads.ts": ["/api/app/ads/requests"],
  };
  const callers = FILES.filter(({ file, text }) => file !== "lib/pay.ts" && /payInApp\(/.test(code(text)));
  assert.deepEqual(callers.map(({ file }) => file).sort(), Object.keys(ALLOWED_PAYMENTS).sort(), "a new payInApp caller must be a physical or B2B payment: add it here and to docs/store-payments-audit.md");
  for (const { file, text } of callers) {
    const lines = code(text).split("\n").filter((line) => line.includes("payInApp("));
    for (const line of lines) assert.ok(ALLOWED_PAYMENTS[file].some((piece) => line.includes(piece)), `${file}: ${line.trim()}`);
  }
  const en = (ns, key) => CATALOGS[ns].en[key];
  assert.match(en("m_packaging", "order.pay"), /prints/);
  assert.match(en("m_settings", "del.payFee"), /delivery fee/);
  assert.match(en("m_partner", "money.paySeller"), /seller/);
  assert.match(en("m_find", "ws.payOrder"), /order/);
  assert.match(en("m_money", "owed.payOwed"), /owed/);
  assert.match(en("m_ads", "c.payFee"), /team's .* setup fee/);
  assert.match(read("docs/store-payments-audit.md"), /\| Path \| Category \| Decision \| File \| Policy \|/);
});
