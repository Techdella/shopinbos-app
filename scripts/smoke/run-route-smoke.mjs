// Route smoke check: requests every app page (and key API routes) as the matching portal role
// and fails on 5xx responses or rendered error boundaries.
//
// Usage (see scripts/smoke/README.md):
//   SMOKE_BASE_URL=http://127.0.0.1:3100 DATABASE_URL=postgres://... node scripts/smoke/run-route-smoke.mjs
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const APP_DIR = path.resolve("src/app");
const ERROR_MARKERS = ["Something went wrong", "Application error", "Internal Server Error", "Unhandled Runtime Error"];

const TOKENS = {
  seller: "smoke-seller",
  supplier: "smoke-supplier",
  logistics_partner: "smoke-logistics",
  admin: "smoke-admin",
};

// Pages that only make sense for signed-out visitors.
const GUEST_PAGES = new Set(["/login", "/signup", "/supplier/login", "/supplier/signup", "/logistics/login", "/logistics/signup", "/admin/login", "/forgot-password", "/reset-password"]);

// Public pages under portal prefixes: must render for signed-out visitors, not redirect to a portal login.
const PUBLIC_PAGES = new Set(["/suppliers/[slug]", "/logistics/partners/[slug]", "/email/unsubscribe/[token]"]);

function authCookie(token) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const session = {
    access_token: token,
    refresh_token: `${token}-refresh`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: token },
  };
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

function roleFor(route) {
  if (route.startsWith("/admin")) return "admin";
  if (route.startsWith("/supplier")) return "supplier";
  if (route.startsWith("/logistics") && !route.startsWith("/logistics/partners")) return "logistics_partner";
  return "seller";
}

function discoverPages(dir = APP_DIR, segments = []) {
  const routes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === "page.tsx") routes.push(segments);
      continue;
    }
    if (entry.name.startsWith("_") || entry.name === "api") continue; // private folders and API handlers
    const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    routes.push(...discoverPages(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]));
  }
  return routes;
}

async function loadParams() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const one = async (sql, args = []) => (await client.query(sql, args)).rows[0] ?? null;
  const store = await one(`select s.id, s.slug from "Store" s join "User" u on u.id = s."userId" where u."supabaseId" = 'seed-seller-001'`);
  const supplier = await one(`select s.id, s.slug from "Supplier" s join "User" u on u.id = s."userId" where u."supabaseId" = 'seed-supplier-001'`);
  const logistics = await one(`select id, slug from "LogisticsPartner" order by "createdAt" limit 1`);
  const supplierProduct = supplier ? await one(`select id, slug from "SupplierProduct" where "supplierId" = $1 limit 1`, [supplier.id]) : null;
  const storeProduct = store ? await one(`select id from "StoreProduct" where "storeId" = $1 limit 1`, [store.id]) : null;
  const storePage = store ? await one(`select id from "StorePage" where "storeId" = $1 limit 1`, [store.id]) : null;
  const order = store ? await one(`select id from "RetailOrder" where "storeId" = $1 limit 1`, [store.id]) : null;
  const collection = store ? await one(`select id from "Collection" where "storeId" = $1 limit 1`, [store.id]) : null;
  const category = await one(`select slug from "Category" order by "sortOrder" limit 1`);
  const campaign = store ? await one(`select id from "BroadcastCampaign" where "storeId" = $1 limit 1`, [store.id]) : null;
  const recipient = campaign ? await one(`select token from "CampaignRecipient" where "campaignId" = $1 limit 1`, [campaign.id]) : null;
  await client.end();

  return {
    "/admin/logistics-partners/[id]": logistics && { id: logistics.id },
    "/admin/suppliers/[id]": supplier && { id: supplier.id },
    "/logistics/partners/[slug]": logistics && { slug: logistics.slug },
    "/suppliers/[slug]": supplier && { slug: supplier.slug },
    "/supplier/products/[id]/edit": supplierProduct && { id: supplierProduct.id },
    "/products/[id]": storeProduct && { id: storeProduct.id },
    "/home/orders/[id]": order && { id: order.id },
    "/home/pages/[id]": storePage && { id: storePage.id },
    "/home/collections/[id]": collection && { id: collection.id },
    "/home/marketing/campaigns/[id]": campaign && { id: campaign.id },
    "/email/unsubscribe/[token]": recipient && { token: recipient.token },
    "/seller/store/builder/[storeId]": store && { storeId: store.id },
    "/seller/store/preview/[storeId]": store && { storeId: store.id },
    "/s/[slug]": store && { slug: store.slug },
    "/s/[slug]/blog": store && { slug: store.slug },
    "/s/[slug]/checkout": store && { slug: store.slug },
    "/s/[slug]/preview": store && { slug: store.slug },
    "/s/[slug]/product/[productId]": store && storeProduct && { slug: store.slug, productId: storeProduct.id },
    "/store/[storeSlug]": store && { storeSlug: store.slug },
    "/store/[storeSlug]/blog": store && { storeSlug: store.slug },
    "/store/[storeSlug]/cart": store && { storeSlug: store.slug },
    "/store/[storeSlug]/checkout": store && { storeSlug: store.slug },
    "/store/[storeSlug]/category/[categorySlug]": store && category && { storeSlug: store.slug, categorySlug: category.slug },
    "/store/[storeSlug]/product/[productSlug]": store && storeProduct && { storeSlug: store.slug, productSlug: storeProduct.id },
    __api: { store, supplier, logistics, supplierProduct },
  };
}

async function check(url, role, results, requireOk = false) {
  const headers = role ? { cookie: authCookie(TOKENS[role]), authorization: `Bearer ${TOKENS[role]}` } : {};
  try {
    const res = await fetch(`${BASE_URL}${url}`, { headers, redirect: "manual" });
    const body = res.status >= 300 && res.status < 400 ? "" : await res.text();
    // Production builds stream server render errors as an error digest and render the boundary client-side.
    const marker = ERROR_MARKERS.find((m) => body.includes(m)) ?? (/digest\\?":\\?"\d+/.test(body) ? "server render error (digest)" : undefined);
    const ok = res.status < 500 && !marker && (!requireOk || res.status === 200);
    results.push({ url, role: role ?? "guest", status: res.status, ok, note: marker ?? (res.headers.get("location") ? `→ ${res.headers.get("location")}` : "") });
  } catch (error) {
    results.push({ url, role: role ?? "guest", status: 0, ok: false, note: String(error) });
  }
}

const params = await loadParams();
const results = [];
const skipped = [];

for (const segments of discoverPages()) {
  const pattern = `/${segments.join("/")}`.replace(/\/$/, "") || "/";
  let url = pattern;
  if (pattern.includes("[")) {
    const values = params[pattern];
    if (!values) {
      skipped.push(pattern);
      continue;
    }
    url = pattern.replace(/\[(\w+)\]/g, (_, key) => encodeURIComponent(values[key]));
  }
  if (PUBLIC_PAGES.has(pattern)) {
    await check(url, null, results, true);
    await check(url, "seller", results, true);
    continue;
  }
  await check(url, GUEST_PAGES.has(pattern) || pattern === "/" ? null : roleFor(pattern), results);
}

const { store, supplier, logistics } = params.__api;
const apiChecks = [
  ["/api/public/health", null],
  ["/api/v1/public/products", null],
  ["/api/v1/public/suppliers", null],
  ["/api/v1/public/logistics/partners", null],
  ["/api/v1/public/categories", null],
  supplier && [`/api/v1/public/suppliers/${supplier.slug}`, null],
  logistics && [`/api/v1/public/logistics/partners/${logistics.slug}`, null],
  store && [`/api/v1/public/store/${store.slug}`, null],
  ["/api/app/user", "seller"],
  ["/api/app/store", "seller"],
  ["/api/app/orders", "seller"],
  ["/api/store/products", "seller"],
  ["/api/store/collections", "seller"],
  ["/api/store/discounts", "seller"],
  ["/api/store/automations", "seller"],
  ["/api/notifications", "seller"],
  ["/api/supplier/me", "supplier"],
  ["/api/supplier/products", "supplier"],
  ["/api/supplier/quote-requests", "supplier"],
  ["/api/logistics/me", "logistics_partner"],
  ["/api/logistics/bookings", "logistics_partner"],
  supplier && [`/api/admin/suppliers/${supplier.id}/documents`, "admin"],
  logistics && [`/api/admin/logistics-partners/${logistics.id}/documents`, "admin"],
].filter(Boolean);
for (const [url, role] of apiChecks) await check(url, role, results);

const failures = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${String(r.status).padEnd(3)} ${r.role.padEnd(17)} ${r.url} ${r.note}`);
if (skipped.length) console.log(`\nskipped (no seed data for params): ${skipped.join(", ")}`);
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
