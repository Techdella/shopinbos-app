#!/usr/bin/env node
// Renders every lifecycle email (src/lib/lifecycle/catalog.ts) through the real email shell with sample accounts,
// into one review page: what triggers each email, who gets it, whether people can switch it off, and the email itself.
//
//   node scripts/preview-lifecycle-emails.mjs [out.html]     (default: lifecycle-emails-preview.html)
//
// Needs Node 22.18+ (it imports the TypeScript catalog directly). The sample accounts are made up.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { LIFECYCLE_RULES, JOURNEY_PRIORITY, DAY } = await import(join(root, "src/lib/lifecycle/catalog.ts"));
const shell = await import(join(root, "src/lib/email/shell.ts"));

const out = process.argv[2] || "lifecycle-emails-preview.html";
const APP = "https://app.shopinbos.com";
const NOW = Date.UTC(2026, 9, 19, 9); // a Monday, so summaries render with this week's numbers

// Logos load from the app in real emails; inline them so the preview works anywhere.
const logo = (name) => `data:image/png;base64,${readFileSync(join(root, "public/brand/email", name)).toString("base64")}`;
const inlineLogos = (doc) =>
  doc.replaceAll(`${APP}/brand/email/shopinbos-logo-navy@2x.png`, logo("shopinbos-logo-navy@2x.png")).replaceAll(`${APP}/brand/email/shopinbos-logo-white@2x.png`, logo("shopinbos-logo-white@2x.png"));

const person = (role, extra) => ({ userId: "sample", role, firstName: "Amaka", email: "amaka@example.com", createdAt: NOW - 400 * DAY, lastActiveAt: NOW - DAY, appUrl: APP, ...extra });
const seller = (s) =>
  person("seller", {
    seller: {
      storeName: "Amaka Couture",
      storeUrl: "https://amaka-couture.shopinbos.store",
      currency: "NGN",
      live: true,
      products: 24,
      payoutBank: true,
      paidOrders: 112,
      revenue: 1_840_500,
      lastPaidOrderAt: NOW - 22 * DAY,
      dropshipProducts: 6,
      deliveryBookings: 40,
      week: { orders: 7, revenue: 126_400, visits: 412, toFulfil: 2 },
      ...s,
    },
  });
const supplier = (s) =>
  person("supplier", {
    supplier: {
      businessName: "Aba Leatherworks",
      verification: "verified",
      products: 18,
      liveProducts: 15,
      dropshipProducts: 9,
      orders: 64,
      revenue: 3_120_000,
      payoutAccount: true,
      week: { orders: 5, revenue: 240_000, quotes: 3, toFulfil: 1 },
      ...s,
    },
  });
const logistics = (s) =>
  person("logistics_partner", {
    logistics: {
      companyName: "Eko Express Riders",
      verification: "verified",
      coverageZones: 6,
      priced: true,
      bookings: 230,
      delivered: 214,
      riders: 5,
      payoutAccount: true,
      week: { bookings: 18, delivered: 16, earnings: 72_000, open: 3 },
      ...s,
    },
  });
const admin = () => person("admin", { admin: { pendingSuppliers: 4, pendingLogistics: 2, week: { sellers: 38, suppliers: 5, logistics: 2, orders: 640, gmv: 18_400_000 } } });

// Each email rendered for an account in the state that triggers it.
const NEW = { createdAt: NOW - 2 * DAY };
function sampleFor(rule) {
  const j = rule.journey;
  if (rule.role === "seller") {
    if (j === "welcome" || j === "onboarding") return { ...seller({ live: false, products: rule.id === "seller.publish_store" ? 3 : 0, payoutBank: false, paidOrders: 0, revenue: 0 }), ...NEW };
    if (rule.id === "seller.first_sale") return seller({ paidOrders: 1, revenue: 18_500 });
    if (rule.id === "seller.first_sale_tips" || rule.id === "seller.payout_setup" || rule.id === "seller.store_live") return seller({ paidOrders: 0, revenue: 0, products: 6 });
    if (rule.id.startsWith("seller.orders_")) return seller({ paidOrders: Number(rule.id.split("_")[1]) + 3 });
    if (rule.id.startsWith("seller.revenue_")) return seller({ revenue: Number(rule.id.split("_")[1]) * 1.04 });
    return seller({});
  }
  if (rule.role === "supplier") {
    if (j === "welcome" || j === "onboarding") return { ...supplier({ verification: "pending", products: rule.id === "supplier.publish_products" ? 4 : 0, liveProducts: 0, orders: 0, revenue: 0 }), ...NEW };
    if (rule.id === "supplier.verified") return supplier({ liveProducts: 0, orders: 0 });
    if (rule.id === "supplier.verification_rejected") return supplier({ verification: "rejected", orders: 0 });
    if (rule.id === "supplier.first_order") return supplier({ orders: 1, revenue: 45_000 });
    if (rule.id.startsWith("supplier.orders_")) return supplier({ orders: Number(rule.id.split("_")[1]) + 2 });
    return supplier({});
  }
  if (rule.role === "logistics_partner") {
    if (j === "welcome" || j === "onboarding") return { ...logistics({ verification: "pending", coverageZones: 0, priced: false, bookings: 0, delivered: 0, riders: 0 }), ...NEW };
    if (rule.id === "logistics.verified") return logistics({ coverageZones: 0, bookings: 0 });
    if (rule.id === "logistics.verification_rejected") return logistics({ verification: "rejected", bookings: 0 });
    if (rule.id === "logistics.first_booking" || rule.id === "logistics.add_riders") return logistics({ bookings: 1, delivered: 0, riders: 0 });
    if (rule.id.startsWith("logistics.deliveries_")) return logistics({ delivered: Number(rule.id.split("_")[1]) + 1 });
    return logistics({});
  }
  return { ...admin(), ...(j === "welcome" ? NEW : {}) };
}

const REASON = { seller: "you have a Shopinbos seller account", supplier: "you have a Shopinbos supplier account", logistics_partner: "you have a Shopinbos delivery partner account", admin: "you're a Shopinbos admin" };
const SETTINGS = { seller: "/home/settings?tab=Notifications", supplier: "/supplier/settings", logistics_partner: "/logistics/settings", admin: "/admin/settings" };

const ctx = { now: NOW, sentAt: () => NOW - 3 * DAY };
const emails = LIFECYCLE_RULES.map((rule) => {
  const facts = sampleFor(rule);
  const content = rule.render(facts, ctx);
  const lifecycle = rule.kind === "lifecycle";
  const doc = shell.platformEmail({
    appUrl: APP,
    kind: rule.kind,
    heading: content.heading,
    eyebrow: content.eyebrow,
    preheader: content.preheader,
    bodyHtml: content.bodyHtml,
    cta: content.cta,
    reason: REASON[rule.role],
    legal: shell.SHOPINBOS_LEGAL_DEFAULTS,
    unsubscribeUrl: lifecycle ? `${APP}/email/unsubscribe/sample` : null,
    preferencesUrl: lifecycle ? `${APP}/email/preferences/sample` : `${APP}${SETTINGS[rule.role]}`,
  });
  return { id: rule.id, role: rule.role, journey: rule.journey, summary: rule.summary, kind: rule.kind, topic: rule.topic, subject: content.subject, preheader: content.preheader, html: inlineLogos(doc) };
});

const ROLE_LABEL = { seller: "Sellers", supplier: "Suppliers", logistics_partner: "Delivery partners", admin: "Admins" };
const JOURNEY_LABEL = { account: "Account", welcome: "Welcome", milestone: "Milestone", loyalty: "Loyalty", onboarding: "Onboarding", activation: "Activation", retention: "Retention", summary: "Weekly summary" };
emails.sort((x, y) => Object.keys(ROLE_LABEL).indexOf(x.role) - Object.keys(ROLE_LABEL).indexOf(y.role) || JOURNEY_PRIORITY.indexOf(x.journey) - JOURNEY_PRIORITY.indexOf(y.journey));

const counts = Object.fromEntries(Object.keys(ROLE_LABEL).map((role) => [role, emails.filter((e) => e.role === role).length]));
const data = JSON.stringify({ emails, ROLE_LABEL, JOURNEY_LABEL, counts }).replace(/</g, "\\u003c");

const page = `<title>Shopinbos Lifecycle Emails</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@1,9..144,400&display=swap">
<style>
/* Layout: a filter bar over a two-pane review list (email facts left, the rendered email right), stacking on phones. Shopinbos tokens. */
:root {
  --paper: #FAF7F1; --card: #FFFFFF; --ink: #0E2A38; --muted: #5F6460; --line: rgba(14,42,56,0.10);
  --mint: #73D8C8; --teal: #2E7E78; --teal-deep: #1F5F5A; --amber: #B5761A; --coral: #C4553D; --plum: #6B4F8A; --chip: #F0ECE3;
  --display: "Space Grotesk", "Segoe UI", Helvetica, Arial, sans-serif;
  --accent: "Fraunces", Georgia, serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #0A1C25; --card: #12303F; --ink: #F4F1EA; --muted: #A9B8BB; --line: rgba(244,241,234,0.12);
  --teal: #73D8C8; --teal-deep: #73D8C8; --amber: #F2A93B; --coral: #F08A73; --plum: #B79AD6; --chip: #173a4b; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #0A1C25; --card: #12303F; --ink: #F4F1EA; --muted: #A9B8BB; --line: rgba(244,241,234,0.12);
  --teal: #73D8C8; --teal-deep: #73D8C8; --amber: #F2A93B; --coral: #F08A73; --plum: #B79AD6; --chip: #173a4b; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--paper); color: var(--ink); font-family: var(--display); font-size: 15px; line-height: 1.5; margin: 0 }
.wrap { max-width: 1180px; margin: 0 auto; padding-inline: 20px; padding-block: 32px 64px }
.eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--teal-deep); margin: 0 0 8px }
h1 { font-size: clamp(26px, 4vw, 34px); font-weight: 500; letter-spacing: -0.025em; margin: 0 0 8px; text-wrap: balance }
h1 em { font-family: var(--accent); font-style: italic; font-weight: 400 }
.lede { color: var(--muted); max-width: 68ch; margin: 0 0 24px }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: 13px; margin: 0 0 20px }
.legend b { color: var(--ink); font-weight: 600 }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: var(--paper); border-bottom: 1px solid var(--line); padding-block: 12px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.bar button { font: 500 13px var(--display); color: var(--ink); background: var(--chip); border: 1px solid transparent; border-radius: 999px; padding: 7px 14px; cursor: pointer }
.bar button[aria-pressed="true"] { background: var(--ink); color: var(--paper) }
.bar button:focus-visible, .toggle:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }
.bar .n { font-family: var(--mono); font-size: 11px; opacity: 0.7; margin-left: 4px }
.role { margin: 28px 0 12px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em }
.list { display: grid; gap: 14px }
.email { background: var(--card); border: 1px solid var(--line); border-radius: 18px; display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); overflow: hidden }
.meta { padding: 20px; display: flex; flex-direction: column; gap: 10px; border-right: 1px solid var(--line); min-width: 0 }
.pills { display: flex; flex-wrap: wrap; gap: 6px }
.pill { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; border: 1px solid currentColor }
.j-account, .j-welcome { color: var(--teal-deep) } .j-milestone, .j-loyalty { color: var(--plum) } .j-onboarding, .j-activation { color: var(--amber) } .j-retention { color: var(--coral) } .j-summary { color: var(--muted) }
.optout { color: var(--muted) }
.id { font-family: var(--mono); font-size: 12px; color: var(--muted); word-break: break-all }
.trigger { font-weight: 500 }
.label { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin: 0 }
.subject { font-weight: 600; margin: 2px 0 0 }
.pre { color: var(--muted); font-size: 13.5px; margin: 2px 0 0 }
.toggle { margin-top: auto; align-self: flex-start; font: 500 13px var(--display); color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; cursor: pointer }
.frame { min-width: 0; background: var(--chip); max-height: 460px; overflow: hidden; position: relative }
.frame.open { max-height: none }
.frame:not(.open)::after { content: ""; position: absolute; inset: auto 0 0 0; height: 64px; background: linear-gradient(transparent, var(--chip)) }
iframe { display: block; width: 100%; border: 0; height: 460px; background: transparent }
@media (max-width: 760px) { .email { grid-template-columns: minmax(0, 1fr) } .meta { border-right: 0; border-bottom: 1px solid var(--line) } }
@media (prefers-reduced-motion: no-preference) { .bar button { transition: background 0.15s, color 0.15s } }
</style>
<div class="wrap">
  <p class="eyebrow">Shopinbos · Email</p>
  <h1>Lifecycle emails, <em>every role, every stage</em></h1>
  <p class="lede">Every email Shopinbos sends its own users because of where they are in their journey, rendered with sample accounts through the real email shell. Each one goes at most once per occurrence, nudges are spaced at least 20 hours apart, and accounts that existed before launch are baselined, so nobody gets old news.</p>
  <div class="legend" id="legend"></div>
  <nav class="bar" id="bar" aria-label="Filter by role"></nav>
  <div id="groups"></div>
</div>
<script id="data" type="application/json">${data}</script>
<script>
const { emails, ROLE_LABEL, JOURNEY_LABEL, counts } = JSON.parse(document.getElementById("data").textContent);
const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const legend = document.getElementById("legend");
const total = emails.length, optional = emails.filter((e) => e.kind === "lifecycle").length;
for (const [label, value] of [["Emails", total], ["Can be switched off", optional], ["Always sent (account news)", total - optional], ["Roles", Object.keys(ROLE_LABEL).length]]) {
  const span = el("span"); span.append(el("b", {}, String(value)), " " + label.toLowerCase()); legend.append(span);
}
const bar = document.getElementById("bar");
const groups = document.getElementById("groups");
let current = "all";
try { current = localStorage.getItem("lifecycle-role") || "all"; } catch (e) {}
function setRole(role) {
  current = role;
  try { localStorage.setItem("lifecycle-role", role); } catch (e) {}
  for (const b of bar.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.role === role));
  for (const g of groups.children) g.hidden = role !== "all" && g.dataset.role !== role;
}
for (const [role, label] of [["all", "All roles"], ...Object.entries(ROLE_LABEL)]) {
  const b = el("button", { type: "button", "data-role": role }, label);
  b.append(el("span", { class: "n" }, String(role === "all" ? total : counts[role])));
  b.addEventListener("click", () => setRole(role));
  bar.append(b);
}
for (const [role, label] of Object.entries(ROLE_LABEL)) {
  const section = el("section", { "data-role": role });
  section.append(el("h2", { class: "role" }, label));
  const list = el("div", { class: "list" });
  for (const e of emails.filter((x) => x.role === role)) {
    const card = el("article", { class: "email", id: e.id.replace(/[^a-z0-9_.-]/gi, "") });
    const meta = el("div", { class: "meta" });
    const pills = el("div", { class: "pills" });
    pills.append(el("span", { class: "pill j-" + e.journey }, JOURNEY_LABEL[e.journey]));
    pills.append(el("span", { class: "pill optout" }, e.kind === "lifecycle" ? (e.topic === "weekly_summary" ? "Opt-out: weekly summaries" : "Opt-out: tips & reminders") : "Always sent"));
    meta.append(pills, el("p", { class: "trigger" }, e.summary), el("p", { class: "id" }, e.id));
    const s = el("div"); s.append(el("p", { class: "label" }, "Subject"), el("p", { class: "subject" }, e.subject), el("p", { class: "pre" }, e.preheader));
    meta.append(s);
    const frame = el("div", { class: "frame" });
    const iframe = el("iframe", { title: "Email preview: " + e.subject, loading: "lazy" });
    iframe.srcdoc = e.html;
    iframe.addEventListener("load", () => { try { iframe.dataset.h = String(iframe.contentDocument.documentElement.scrollHeight); } catch (err) {} });
    frame.append(iframe);
    const toggle = el("button", { type: "button", class: "toggle", "aria-expanded": "false" }, "Show whole email");
    toggle.addEventListener("click", () => {
      const open = frame.classList.toggle("open");
      iframe.style.height = open ? (iframe.dataset.h || 900) + "px" : "";
      toggle.textContent = open ? "Collapse" : "Show whole email";
      toggle.setAttribute("aria-expanded", String(open));
    });
    meta.append(toggle);
    card.append(meta, frame);
    list.append(card);
  }
  section.append(list);
  groups.append(section);
}
setRole(current in ROLE_LABEL || current === "all" ? current : "all");
</script>
`;

writeFileSync(out, page);
console.log(`wrote ${out}: ${emails.length} emails, ${(page.length / 1024).toFixed(0)} KB`);
