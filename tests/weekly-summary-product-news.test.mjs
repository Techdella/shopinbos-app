// Weekly summaries, product news and the template fixes: the Lagos week window, ▲/▼ changes, the quiet-week rule,
// de-duplication, product news audience and preference filtering, body sanitising, the pasted-HTML logo header,
// and a single compliance footer in every library template.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const weekly = await import("../src/lib/email/weekly-summary.ts");
const news = await import("../src/lib/email/product-news.ts");
const shell = await import("../src/lib/email/shell.ts");
const layout = await import("../src/lib/marketing/email-layout.ts");
const preview = await import("../src/lib/marketing/preview.ts");
const library = await import("../src/lib/marketing/template-library.ts");
const blocks = await import("../src/lib/marketing/blocks.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const APP = "https://app.example";
const LEGAL = { name: shell.SHOPINBOS_LEGAL_DEFAULTS.name, address: shell.SHOPINBOS_LEGAL_DEFAULTS.address };
const HOSTS = { storage: ["abc.supabase.co"], own: ["shopinbos.com", "app.example"] };
const count = (text, re) => (text.match(re) ?? []).length;

// ─── Weekly summary ────────────────────────────────────────────────────────────

test("the week is the last full Monday–Sunday in Lagos time", () => {
  // Monday 07:00 Lagos (06:00 UTC), when the cron runs: last week is 5–11 Oct.
  const w = weekly.lastWeekWindow(new Date("2026-10-12T06:00:00Z"));
  assert.equal(w.weekStart, "2026-10-05");
  assert.equal(w.weekEnd, "2026-10-11");
  assert.equal(w.start.toISOString(), "2026-10-04T23:00:00.000Z", "Lagos midnight is 23:00 UTC the day before");
  assert.equal(w.end.toISOString(), "2026-10-11T23:00:00.000Z");
  assert.equal(w.previous.start.toISOString(), "2026-09-27T23:00:00.000Z");
  assert.equal(w.previous.end.toISOString(), w.start.toISOString());
  assert.equal(w.label, "5–11 Oct");
  // 00:30 Monday in Lagos is still Sunday in UTC: the week has already ended.
  assert.equal(weekly.lastWeekWindow(new Date("2026-10-11T23:30:00Z")).weekStart, "2026-10-05");
  // 23:30 Sunday in Lagos: the week isn't over, so the last full one is the week before.
  assert.equal(weekly.lastWeekWindow(new Date("2026-10-11T22:30:00Z")).weekStart, "2026-09-28");
  // Any time in the week maps to the same Monday; month boundaries read well.
  assert.equal(weekly.lastWeekWindow(new Date("2026-10-08T12:00:00Z")).weekStart, "2026-09-28");
  assert.equal(weekly.lastWeekWindow(new Date("2026-10-08T12:00:00Z")).label, "28 Sep – 4 Oct");
  assert.equal(weekly.daysBetween("2026-09-14", "2026-10-12"), 28);
});

test("% change and ▲/▼ formatting, money in naira", () => {
  assert.equal(weekly.percentChange(125, 100), 25);
  assert.equal(weekly.percentChange(90, 100), -10);
  assert.equal(weekly.percentChange(5, 0), null, "no % from zero");
  assert.equal(weekly.percentChange(0, 0), 0);
  assert.deepEqual(weekly.formatChange(125, 100), { direction: "up", text: "▲ 25% vs last week" });
  assert.deepEqual(weekly.formatChange(90, 100), { direction: "down", text: "▼ 10% vs last week" });
  assert.deepEqual(weekly.formatChange(0, 10), { direction: "down", text: "▼ 100% vs last week" });
  assert.deepEqual(weekly.formatChange(7, 0), { direction: "up", text: "▲ New this week" });
  assert.equal(weekly.formatChange(0, 0).direction, "flat");
  assert.equal(weekly.formatChange(100, 100).text, "Same as last week");
  assert.equal(weekly.formatChange(50_000, 1).text, "▲ 999%+ vs last week");
  assert.equal(weekly.money(1250000), "₦1,250,000");
  assert.equal(weekly.money(1999.6), "₦2,000");
});

const seller = (over = {}) => ({
  role: "seller",
  name: "Chioma Eze",
  storeName: "Ada & <Co>",
  currency: "NGN",
  orders: { current: 12, previous: 8 },
  revenue: { current: 486000, previous: 540000 },
  visits: { current: 640, previous: 512 },
  subscribers: { current: 9, previous: 4 },
  carts: { abandoned: 7, recovered: 2, recoveredValue: 41000 },
  topProducts: [
    { name: "Adire print dress", quantity: 6, revenue: 171000 },
    { name: "Indigo kaftan", quantity: 3, revenue: 102000 },
    { name: "Coral bead necklace", quantity: 4, revenue: 72000 },
    { name: "Fourth", quantity: 1, revenue: 1 },
  ],
  ...over,
});
const quietSeller = () => seller({ orders: { current: 0, previous: 0 }, revenue: { current: 0, previous: 0 }, visits: null, subscribers: { current: 0, previous: 0 }, carts: { abandoned: 0, recovered: 0, recoveredValue: 0 }, topProducts: [] });

test("quiet weeks: no empty reports, a short note at most once every 4 weeks", () => {
  assert.equal(weekly.hasActivity(seller()), true);
  assert.equal(weekly.hasActivity(quietSeller()), false);
  assert.equal(weekly.hasActivity({ ...quietSeller(), visits: { current: 3, previous: 0 } }), true, "visits count as activity");
  assert.equal(weekly.quietWeekDue(null, "2026-10-05"), true, "never had one");
  assert.equal(weekly.quietWeekDue("2026-09-14", "2026-10-05"), false, "3 weeks ago");
  assert.equal(weekly.quietWeekDue("2026-09-07", "2026-10-05"), true, "4 weeks ago");
  assert.equal(weekly.summaryKind({ active: true, lastQuietWeekStart: "2026-09-28", weekStart: "2026-10-05" }), "full");
  assert.equal(weekly.summaryKind({ active: false, lastQuietWeekStart: null, weekStart: "2026-10-05" }), "quiet");
  assert.equal(weekly.summaryKind({ active: false, lastQuietWeekStart: "2026-09-21", weekStart: "2026-10-05" }), "none");
  const supplier = { role: "supplier", name: "Eze", businessName: "Eze Supply", currency: "NGN", newOrders: { current: 0, previous: 2 }, wholesaleOrders: 0, dropshipOrders: 0, quotesAnswered: 0, quotesOpen: 3, newQuotes: 0, earned: { current: 0, previous: 0 }, owed: 50000 };
  assert.equal(weekly.hasActivity(supplier), false, "open quotes from before and money owed aren't this week's activity");
  const rider = { role: "logistics_partner", name: "Emeka", companyName: "Emeka Fleet", currency: "NGN", completed: { current: 0, previous: 0 }, onTime: null, earnings: { current: 0, previous: 0 }, newJobs: 1, failed: 0 };
  assert.equal(weekly.hasActivity(rider), true);
});

test("weekly summary emails: stat tiles, ▲/▼, ₦, top 3, a rules-based tip, the dashboard button and the lifecycle footer", () => {
  const week = weekly.lastWeekWindow(new Date("2026-10-12T06:00:00Z"));
  const { subject, html } = weekly.weeklySummaryDocument(seller(), { appUrl: APP, week, legal: LEGAL, reason: "you have a Shopinbos seller account", unsubscribeUrl: `${APP}/email/preferences/t?unsubscribe=1`, preferencesUrl: `${APP}/email/preferences/t` });
  assert.equal(subject, "Your week at Ada & <Co>: 12 orders, ₦486,000");
  assert.match(html, /class="sib-tile"/);
  assert.match(html, /▲ 50% vs last week/, "orders 8 → 12");
  assert.match(html, /▼ 10% vs last week/, "revenue 540k → 486k");
  assert.match(html, /₦486,000/);
  assert.match(html, /Ada &amp; &lt;Co&gt;/, "store name escaped");
  assert.doesNotMatch(html, /Ada & <Co>/);
  assert.match(html, /Adire print dress/);
  assert.doesNotMatch(html, /Fourth/, "top 3 only");
  assert.match(html, /2 of 7/, "carts won back");
  assert.match(html, /(Rex|Peggy)&#39;s tip/);
  assert.match(html, /href="https:\/\/app\.example\/home"[^>]*>Open your dashboard</);
  assert.match(html, /class="sib-foot-link sib-unsubscribe"/);
  assert.match(html, /prefers-color-scheme:dark\)\{\.sib-up/, "dark-mode colours for the change lines");
  assert.match(html, /shopinbos-logo-navy@2x\.png/);

  // Tips come from the data, no AI.
  assert.equal(weekly.sellerTip(seller({ orders: { current: 0, previous: 0 }, visits: { current: 40, previous: 0 } })).who, "Peggy");
  assert.match(weekly.sellerTip(seller({ carts: { abandoned: 5, recovered: 0, recoveredValue: 0 } })).text, /cart reminders/);
  assert.match(weekly.sellerTip(seller({ carts: { abandoned: 0, recovered: 0, recoveredValue: 0 }, orders: { current: 2, previous: 9 } })).text, /down on last week/);
  assert.match(weekly.sellerTip(seller({ carts: { abandoned: 0, recovered: 0, recoveredValue: 0 } })).text, /Adire print dress was your best seller/);

  const quiet = weekly.weeklySummaryDocument(quietSeller(), { appUrl: APP, week, kind: "quiet", legal: LEGAL, reason: "you have a Shopinbos seller account" });
  assert.equal(quiet.subject, "A quiet week: here's one thing to try");
  assert.doesNotMatch(quiet.html, /sib-tile"/, "no empty stat tiles");
  assert.match(quiet.html, /Find products to sell/);

  const supplier = weekly.renderWeeklySummary({ role: "supplier", name: "Eze", businessName: "Eze Supply", currency: "NGN", newOrders: { current: 5, previous: 2 }, wholesaleOrders: 2, dropshipOrders: 3, quotesAnswered: 4, quotesOpen: 1, newQuotes: 3, earned: { current: 320000, previous: 0 }, owed: 150000 }, { appUrl: APP, week });
  assert.match(supplier.bodyHtml, /2 wholesale · 3 dropship/);
  assert.match(supplier.bodyHtml, /▲ New this week/);
  assert.match(supplier.bodyHtml, /₦150,000/);
  assert.equal(supplier.cta.url, `${APP}/supplier/dashboard`);
  const rider = weekly.renderWeeklySummary({ role: "logistics_partner", name: "Emeka", companyName: "Emeka Fleet", currency: "NGN", completed: { current: 18, previous: 20 }, onTime: { onTime: 15, total: 18 }, earnings: { current: 72000, previous: 80000 }, newJobs: 22, failed: 1 }, { appUrl: APP, week });
  assert.match(rider.bodyHtml, /83%/, "on-time rate");
  assert.match(rider.bodyHtml, /▼ 10% vs last week/);
});

test("no duplicates: one row per user and week, claimed before sending; one per broadcast and user", () => {
  assert.equal(weekly.weeklySummaryKey("u1", "2026-10-05"), weekly.weeklySummaryKey("u1", "2026-10-05"));
  assert.notEqual(weekly.weeklySummaryKey("u1", "2026-10-05"), weekly.weeklySummaryKey("u1", "2026-10-12"));
  assert.notEqual(weekly.weeklySummaryKey("u1", "2026-10-05"), weekly.weeklySummaryKey("u2", "2026-10-05"));
  assert.notEqual(news.productNewsRecipientKey("b1", "u1"), news.productNewsRecipientKey("b2", "u1"));

  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model WeeklySummaryLog \{[\s\S]*?@@unique\(\[userId, weekStart\]\)/);
  assert.match(schema, /model ProductNewsRecipient \{[\s\S]*?@@unique\(\[broadcastId, userId\]\)/);
  const sql = read("docs/migrations/2026-10-16-weekly-summary-product-news.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "WeeklySummaryLog_userId_weekStart_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "ProductNewsRecipient_broadcastId_userId_key"/);
  for (const table of ["WeeklySummaryLog", "ProductNewsBroadcast", "ProductNewsRecipient"]) assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  assert.match(sql, /-- select cron\.schedule\(\n--   'weekly-summary',\n--   '0 6 \* \* 1'/);
  assert.match(sql, /https:\/\/shopinbos-app\.vercel\.app\/api\/cron\/weekly-summary/);
  assert.match(sql, /name = 'cron_secret'/);

  const server = read("src/lib/email/weekly-summary.server.ts");
  assert.match(server, /createManyAndReturn\([\s\S]*?skipDuplicates: true/, "the claim is an insert that skips rows another run made");
  assert.match(server, /topic: "weekly_summary"/);
  assert.match(server, /kind: "lifecycle"/);
  const newsServer = read("src/lib/email/product-news.server.ts");
  assert.match(newsServer, /FOR UPDATE SKIP LOCKED/, "overlapping runs never take the same recipients");
  assert.match(newsServer, /topic: "product_news"/);
  assert.match(newsServer, /sendEmailBatch\(/);
  for (const route of ["src/app/api/cron/weekly-summary/route.ts", "src/app/api/cron/product-news/route.ts"]) {
    const src = read(route);
    assert.match(src, /cronAuthorization\(req\.headers\.get\("authorization"\), secret\)/);
    assert.match(src, /process\.env\.CRON_SECRET/);
  }
  for (const route of ["route.ts", "[id]/route.ts", "[id]/send/route.ts", "[id]/retry/route.ts", "test/route.ts", "audience/route.ts"]) {
    const src = read(`src/app/api/admin/product-news/${route}`);
    assert.match(src, /withAdmin\(/, `${route} is admin only`);
    assert.doesNotMatch(src, /withAuth\(|withSeller/);
  }
});

// ─── Product news ─────────────────────────────────────────────────────────────

test("product news audience: only the chosen roles, with an email; anyone who turned it off is skipped", () => {
  const users = [
    { id: "s1", role: "seller", email: "a@x.ng", productNewsOff: false },
    { id: "s2", role: "seller", email: "b@x.ng", productNewsOff: true },
    { id: "s3", role: "seller", email: null, productNewsOff: false },
    { id: "p1", role: "supplier", email: "c@x.ng", productNewsOff: false },
    { id: "l1", role: "logistics_partner", email: "d@x.ng", productNewsOff: true },
    { id: "a1", role: "admin", email: "e@x.ng", productNewsOff: false },
  ];
  const sellers = news.splitNewsAudience(users, ["seller"]);
  assert.deepEqual(sellers.send.map((u) => u.id), ["s1"]);
  assert.deepEqual(sellers.skipped.map((u) => u.id), ["s2"]);
  const all = news.splitNewsAudience(users, news.ALL_NEWS_AUDIENCES);
  assert.deepEqual(all.send.map((u) => u.id), ["s1", "p1"]);
  assert.deepEqual(all.skipped.map((u) => u.id), ["s2", "l1"]);
  assert.ok(!all.send.some((u) => u.role === "admin"), "\"everyone\" means sellers, suppliers and delivery partners");
  assert.equal(news.audienceLabel(news.ALL_NEWS_AUDIENCES), "Everyone");
  assert.equal(news.audienceLabel(["supplier", "logistics_partner"]), "Suppliers, Delivery partners");
});

test("product news body: markdown in, escaped HTML out; images only from our storage over https", () => {
  const body = news.renderNewsBody('Hi <b>there</b> & "friends"\n\n<script>alert(1)</script>\n\n## New **today**\n\n- One [docs](https://shopinbos.com/help?a=1&b=2)\n- Two [bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)> *nice*');
  assert.doesNotMatch(body, /<(script|b|img)\b|href="javascript/i, "no live tags or script links (escaped text is fine)");
  assert.match(body, /Hi &lt;b&gt;there&lt;\/b&gt; &amp; &quot;friends&quot;/);
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(body, /<h2[^>]*>New <strong>today<\/strong><\/h2>/);
  assert.match(body, /<ul[^>]*><li[^>]*>One <a href="https:\/\/shopinbos\.com\/help\?a=1&amp;b=2"/);
  assert.match(body, /\[bad\]\(javascript:alert\(1\)\)/, "unsafe links stay as text");
  assert.match(body, /<em>nice<\/em>/);

  assert.equal(news.isAllowedNewsImage("https://abc.supabase.co/storage/v1/object/public/news/a.png", HOSTS), true);
  assert.equal(news.isAllowedNewsImage("https://abc.supabase.co/storage/v1/object/sign/news/a.png", HOSTS), false, "public objects only");
  assert.equal(news.isAllowedNewsImage("http://abc.supabase.co/storage/v1/object/public/news/a.png", HOSTS), false, "https only");
  assert.equal(news.isAllowedNewsImage("https://cdn.shopinbos.com/a.png", HOSTS), true);
  assert.equal(news.isAllowedNewsImage("https://shopinbos.com.evil.example/a.png", HOSTS), false);
  assert.equal(news.isAllowedNewsImage("https://evil.example/shopinbos.com/a.png", HOSTS), false);
  assert.equal(news.isAllowedNewsImage("https://user:pw@shopinbos.com/a.png", HOSTS), false);
  assert.equal(news.isAllowedNewsImage("javascript:alert(1)", HOSTS), false);

  const schema = news.productNewsSchema(HOSTS);
  const ok = { subject: "New", heading: "Hello", body: "Hi", audience: ["seller"] };
  assert.equal(schema.safeParse(ok).success, true);
  assert.equal(schema.safeParse({ ...ok, audience: [] }).success, false);
  assert.equal(schema.safeParse({ ...ok, audience: ["admin"] }).success, false);
  assert.equal(schema.safeParse({ ...ok, imageUrl: "https://evil.example/a.png" }).success, false);
  assert.equal(schema.safeParse({ ...ok, ctaLabel: "Go" }).success, false, "a button needs a link");
  assert.equal(schema.safeParse({ ...ok, ctaLabel: "Go", ctaUrl: "javascript:alert(1)" }).success, false);
  assert.equal(schema.safeParse({ ...ok, ctaLabel: "Go", ctaUrl: "https://app.example/home" }).success, true);

  const html = news.productNewsDocument({ ...ok, heading: "<New>", imageUrl: "https://evil.example/a.png", ctaLabel: "Try it", ctaUrl: "https://app.example/home" }, { appUrl: APP, legal: LEGAL, hosts: HOSTS, reason: "you have a Shopinbos seller account", unsubscribeUrl: `${APP}/u`, preferencesUrl: `${APP}/p` });
  assert.match(html, /&lt;New&gt;/);
  assert.doesNotMatch(html, /evil\.example/, "a disallowed image never reaches the email");
  assert.match(html, /class="sib-foot-link sib-unsubscribe"/);
  assert.match(html, />Try it</);
});

// ─── Templates ────────────────────────────────────────────────────────────────

const BRAND = { storeName: "Ada & <Co>", logoUrl: null, accent: "#FF6A2B", ink: "#111111", paper: "#F6F5F9" };
const SENDER = { name: "Ada & <Co>", legalName: "Ada Fabrics Ltd", address: "12 Allen Avenue, Ikeja", websiteUrl: "https://ada.shopinbos.shop", contactUrl: "mailto:hi@ada.ng", privacyUrl: "https://ada.shopinbos.shop/policies" };
const compliance = { appUrl: APP, sender: SENDER, kind: "marketing", unsubscribeUrl: `${APP}/u`, preferencesUrl: `${APP}/p` };

test("pasted full-HTML templates get the brand header after <body>, unless it's off or already there", () => {
  const doc = '<!doctype html><html><head><title>x</title></head><body style="margin:0"><table><tr><td>Sale!</td></tr></table></body></html>';
  const html = layout.wrapEmail({ bodyHtml: doc, brand: BRAND, compliance });
  const afterBody = html.slice(html.indexOf('<body style="margin:0">') + '<body style="margin:0">'.length);
  assert.match(afterBody, /^\n<!--sib-brand-header--><table role="presentation"/, "right after <body>");
  assert.match(afterBody, /max-width:600px;margin:0 auto/);
  assert.match(afterBody, /class="sib-store-name"[^>]*>Ada &amp; &lt;Co&gt;<\/span>/, "the store name, escaped, when there's no logo");
  assert.ok(html.indexOf("sib-brand-header") < html.indexOf("Sale!"));
  assert.ok(html.indexOf("Ada Fabrics Ltd") < html.indexOf("</body>"), "footer still goes before </body>");
  assert.equal(count(html, /<body\b/g), 1);

  const logo = { ...BRAND, logoUrl: "https://cdn.example/logo.png?a=1&b=2" };
  const withLogo = layout.wrapEmail({ bodyHtml: doc, brand: logo, compliance });
  assert.match(withLogo, /<img class="sib-chip" src="https:\/\/cdn\.example\/logo\.png\?a=1&amp;b=2"/);
  const already = layout.wrapEmail({ bodyHtml: doc.replace("Sale!", '<img src="https://cdn.example/logo.png?a=1&amp;b=2">Sale!'), brand: logo, compliance });
  assert.doesNotMatch(already, /class="sib-brand-header"/, "the document already shows the logo");
  const off = layout.setLogoHeader(doc, false);
  assert.equal(layout.logoHeaderOn(off), false);
  assert.equal(layout.setLogoHeader(off, true), doc);
  assert.doesNotMatch(layout.wrapEmail({ bodyHtml: off, brand: BRAND, compliance }), /class="sib-brand-header"/, "switched off in the builder");
  assert.doesNotMatch(preview.renderEmailPreview({ bodyHtml: off, brand: BRAND, shop: { name: "Ada", url: "https://ada.shopinbos.shop", appUrl: APP } }), /sib-logo:off/, "the switch's marker never shows");

  const noBody = '<html><head><style>p{color:red}</style></head><p>Hi</p></html>';
  const wrapped = layout.wrapEmail({ bodyHtml: noBody, brand: BRAND, compliance });
  assert.match(wrapped, /<\/head>\n<body>\n<!--sib-brand-header-->/);
  assert.match(wrapped, /<p>Hi<\/p>[\s\S]*Ada Fabrics Ltd[\s\S]*<\/body>\n<\/html>/);
  assert.equal(count(wrapped, /<body\b/g), 1);
  const bare = layout.wrapEmail({ bodyHtml: "<html><p>Hi</p>", brand: BRAND, compliance });
  assert.match(bare, /^<html>\n<head>[\s\S]*<\/head>\n<body>\n<!--sib-brand-header-->/, "dark-mode support adds a <head> (tests/email-retry-and-upload.test.mjs)");
  assert.match(bare, /<\/body>$/);
});

test("every library template has one compliance footer: no second 'why you're getting this' or Unsubscribe", () => {
  const brand = { storeName: "Ada & Co", logoUrl: null, accent: "#FF6A2B", ink: "#111111", paper: "#F6F5F9" };
  const shop = { name: "Ada & Co", url: "https://ada.shopinbos.shop", appUrl: APP, sender: { address: "12 Allen Avenue, Ikeja", legalName: "Ada Fabrics Ltd" } };
  const WHY = /(getting|receiving|received) this (email )?because/gi;
  for (const tpl of library.TEMPLATE_LIBRARY) {
    assert.doesNotMatch(tpl.bodyHtml, WHY, `${tpl.key}: no compliance line in the template body`);
    const html = preview.renderEmailPreview({ bodyHtml: tpl.bodyHtml, preheader: tpl.preheader, brand, shop });
    assert.equal(count(html, WHY), 1, `${tpl.key}: the reason appears once`);
    assert.equal(count(html, />Unsubscribe</g), 1, `${tpl.key}: one Unsubscribe link`);
    assert.equal(count(html, /12 Allen Avenue, Ikeja/g), 1, `${tpl.key}: the address once`);
  }
  // Templates sellers saved before this change (the old footer default and its unsubscribe link) are cleaned when wrapped.
  const old = blocks.htmlFromBlocks([
    { type: "heading", text: "Hello" },
    { type: "footer", text: "You're getting this because you shop with {{store}}. Reply to this email any time, a real person reads it.", unsubscribe: true },
    { type: "footer", text: "You're getting this because you shop with {{store}}.", unsubscribe: true, variant: "panel" },
  ]);
  const html = preview.renderEmailPreview({ bodyHtml: old, brand, shop });
  assert.equal(count(html, WHY), 1);
  assert.equal(count(html, />Unsubscribe</g), 1);
  assert.match(html, /Reply to this email any time, a real person reads it\./, "the designed sign-off stays");
  // A seller's own wording stays as it is.
  const own = preview.renderEmailPreview({ bodyHtml: blocks.htmlFromBlocks([{ type: "footer", text: "Made with love in Ibadan." }]), brand, shop });
  assert.match(own, /Made with love in Ibadan\./);
});
