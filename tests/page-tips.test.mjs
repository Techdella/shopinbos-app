// Peggy page tips for first-time sellers (src/components/learn/PageTip.tsx): every tipped page renders the shared,
// tips-switch-aware PageTip with an English tip from the "tips" namespace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { default: tips } = await import("../shared/i18n/messages/tips/en.ts");

const TIPPED = {
  "marketing/social/[id]": "social.post",
  "marketing/social/accounts": "social.accounts",
  "marketing/social/new": "social.new",
  "cms/plan": "cms.plan",
  "cms/[collectionId]/[itemId]": "cms.item",
  "analytics/traffic": "traffic",
  "inbox/channels": "inbox.channels",
  "inbox/email": "inbox.email",
  "inbox/settings": "inbox.settings",
  "inbox/chatbot": "inbox.chatbot",
  "inbox/whatsapp-store": "inbox.whatsappStore",
  connections: "connections",
  wallet: "wallet",
  labels: "labels",
  "labels/packaging": "labels.packaging",
  "labels/studio": "labels.studio",
  "labels/request": "labels.request",
  "labels/order": "labels.order",
  "labels/orders": "labels.orders",
  "video/studio": "video.studio",
  "reviews/request": "reviews.request",
  "reviews/share": "reviews.share",
  "reviews/sources": "reviews.sources",
  orders: "orders",
  "orders/new": "orders.new",
  customers: "customers",
  inventory: "inventory",
  collections: "collections",
  categories: "categories",
  media: "media",
  "brand-kit": "brandKit",
  seo: "seo",
  store: "store",
  navigation: "navigation",
  imports: "imports",
  checkout: "checkout",
  "commerce/cart": "cart",
  "payment-links": "paymentLinks",
  affiliates: "affiliates",
  ads: "ads",
  "ads/new": "ads.new",
  health: "health",
  activity: "activity",
  credits: "credits",
  "register-business": "registerBusiness",
};

test("PageTip hides itself when tips are switched off", () => {
  const src = read("src/components/learn/PageTip.tsx");
  assert.match(src, /^"use client";/);
  assert.match(src, /useTipsOn\(\)/);
  assert.match(src, /if \(!on\) return null;/);
  assert.match(src, /<AssistantNote/);
});

test("each tipped seller page renders PageTip with its own tip", () => {
  for (const [route, key] of Object.entries(TIPPED)) {
    const src = read(`src/app/home/${route}/page.tsx`);
    assert.match(src, /import \{ PageTip \} from "@\/components\/learn\/PageTip";/, `${route} imports PageTip`);
    assert.match(src, /const tipT = await getT\("tips"\);/, `${route} loads the tips namespace`);
    assert.ok(src.includes(`<PageTip`) && src.includes(`{tipT("${key}")}</PageTip>`), `${route} renders the ${key} tip`);
    assert.ok(typeof tips[key] === "string" && tips[key].length > 20 && tips[key].length <= 200, `${key} is a short tip`);
  }
});

// Supplier and delivery-partner pages: Peggy for how-to, Rex for growth (tips namespace supplier.* / logistics.*).
const PORTAL_TIPPED = {
  "supplier/orders": ["supplier.orders", "supplier.wholesale"],
  "supplier/products": ["supplier.products"],
  "supplier/quote-requests": ["supplier.quoteRequests"],
  "supplier/payouts": ["supplier.payouts"],
  "supplier/delivery": ["supplier.delivery"],
  "supplier/agreements": ["supplier.agreements"],
  "supplier/buyers": ["supplier.buyers"],
  "supplier/contracts": ["supplier.contracts"],
  "logistics/bookings": ["logistics.bookings"],
  "logistics/quotes": ["logistics.quotes"],
  "logistics/couriers": ["logistics.couriers"],
  "logistics/cash": ["logistics.cash"],
  "logistics/coverage": ["logistics.coverage"],
  "logistics/rates": ["logistics.rates"],
  "logistics/pickup-points": ["logistics.pickupPoints"],
  "logistics/payouts": ["logistics.payouts"],
  "logistics/connections": ["logistics.connections"],
  "logistics/contracts": ["logistics.contracts"],
};

test("supplier and delivery-partner pages show Peggy and Rex tips too", () => {
  for (const [route, keys] of Object.entries(PORTAL_TIPPED)) {
    const src = read(`src/app/${route}/page.tsx`);
    assert.match(src, /import \{ PageTip \} from "@\/components\/learn\/PageTip";/, `${route} imports PageTip`);
    assert.match(src, /const tipT = await getT\("tips"\);/, `${route} loads the tips namespace`);
    assert.match(src, /<PageTip who="(peggy|rex)"/, `${route} says who gives the tip`);
    for (const key of keys) {
      assert.ok(src.includes(`"${key}"`), `${route} shows ${key}`);
      assert.ok(typeof tips[key] === "string" && tips[key].length > 20 && tips[key].length <= 200, `${key} is a short tip`);
    }
  }
});

test("every tip is used by a page", () => {
  const used = new Set([...Object.values(TIPPED), ...Object.values(PORTAL_TIPPED).flat()]);
  for (const key of Object.keys(tips)) assert.ok(used.has(key), `tips.${key} is shown somewhere`);
});

test("credits and business registration have 60-second intros", async () => {
  const { introForPath } = await import("../shared/feature-intros.ts");
  assert.equal(introForPath("/home/credits", "seller")?.key, "credits");
  assert.equal(introForPath("/supplier/credits", "supplier")?.key, "credits");
  assert.equal(introForPath("/logistics/credits", "logistics_partner")?.key, "credits");
  assert.equal(introForPath("/home/register-business", "seller")?.key, "business-registration");
  assert.equal(introForPath("/logistics/register-business", "logistics_partner")?.key, "business-registration");
});
