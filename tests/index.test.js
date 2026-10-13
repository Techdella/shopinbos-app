const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(workspaceRoot, relativePath));

test("public marketplace contract constants stay locked for WordPress consumers", () => {
  const contract = require(path.join(workspaceRoot, "src/lib/public-marketplace-contract.js"));

  assert.deepEqual(contract.PUBLIC_API_ALLOWED_ORIGINS, [
    "https://shopinbos.com",
    "https://www.shopinbos.com",
    "http://localhost:3000",
    "http://localhost:8080",
  ]);
  assert.deepEqual(contract.PUBLIC_API_ALLOWED_METHODS, ["GET", "OPTIONS"]);
  assert.deepEqual(contract.PUBLIC_API_ALLOWED_HEADERS, ["Content-Type"]);
  assert.equal(contract.PUBLIC_API_BASE_PATH, "/api/v1/public");
  assert.equal(contract.PUBLIC_API_LEGACY_BASE_PATH, "/api/public");
  assert.equal(contract.PUBLIC_LIST_CACHE, "public, max-age=300, stale-while-revalidate=600");
  assert.equal(contract.PUBLIC_DETAIL_CACHE, "public, max-age=600, stale-while-revalidate=1200");
});

test("versioned public marketplace routes mirror the legacy API for marketing clients", () => {
  const routePairs = [
    ["src/app/api/v1/public/health/route.ts", "@/app/api/public/health/route"],
    ["src/app/api/v1/public/categories/route.ts", "@/app/api/public/categories/route"],
    ["src/app/api/v1/public/categories/[slug]/route.ts", "@/app/api/public/categories/[slug]/route"],
    ["src/app/api/v1/public/products/route.ts", "@/app/api/public/products/route"],
    ["src/app/api/v1/public/products/search/route.ts", "@/app/api/public/products/search/route"],
    ["src/app/api/v1/public/products/trending/route.ts", "@/app/api/public/products/trending/route"],
    ["src/app/api/v1/public/products/category/[categorySlug]/route.ts", "@/app/api/public/products/category/[categorySlug]/route"],
    ["src/app/api/v1/public/products/[slug]/route.ts", "@/app/api/public/products/[slug]/route"],
    ["src/app/api/v1/public/suppliers/route.ts", "@/app/api/public/suppliers/route"],
    ["src/app/api/v1/public/suppliers/search/route.ts", "@/app/api/public/suppliers/search/route"],
    ["src/app/api/v1/public/suppliers/[slug]/route.ts", "@/app/api/public/suppliers/[slug]/route"],
    ["src/app/api/v1/public/logistics/partners/route.ts", "@/app/api/public/logistics/partners/route"],
    ["src/app/api/v1/public/logistics/partners/search/route.ts", "@/app/api/public/logistics/partners/search/route"],
    ["src/app/api/v1/public/logistics/partners/[slug]/route.ts", "@/app/api/public/logistics/partners/[slug]/route"],
    ["src/app/api/v1/public/store/[slug]/route.ts", "@/app/api/public/store/[slug]/route"],
    ["src/app/api/v1/public/store/[slug]/checkout/route.ts", "@/app/api/public/store/[slug]/checkout/route"],
  ];

  routePairs.forEach(([routePath, legacyModule]) => {
    assert.ok(exists(routePath), `${routePath} should exist`);
    assert.match(read(routePath), new RegExp(legacyModule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("intent routing keeps WordPress handoff flows inside the right app surfaces", () => {
  const routing = require(path.join(workspaceRoot, "src/lib/intent-routing.js"));

  assert.equal(
    routing.getContinuationPath({
      role: "seller",
      intent: "book_delivery",
      logisticsSlug: "swift-courier",
      source: "wordpress",
    }),
    "/home/logistics?intent=book_delivery&logisticsSlug=swift-courier&source=wordpress",
  );

  assert.equal(
    routing.getContinuationPath({
      role: "logistics_partner",
      intent: "book_delivery",
      logisticsSlug: "swift-courier",
    }),
    "/logistics/bookings?intent=book_delivery&logisticsSlug=swift-courier",
  );

  assert.equal(
    routing.getContinuationPath({
      role: "supplier",
      intent: "view_products",
      supplierSlug: "andes-cacao",
    }),
    "/supplier/products?intent=view_products&supplierSlug=andes-cacao",
  );

  assert.equal(
    routing.sanitizeNextPath("https://app.shopinbos.com/marketplace?intent=add", "https://app.shopinbos.com"),
    "/marketplace?intent=add",
  );
  assert.equal(routing.sanitizeNextPath("https://evil.example/marketplace", "https://app.shopinbos.com"), null);
  assert.equal(routing.sanitizeNextPath("/home/settings", "https://app.shopinbos.com"), "/home/settings");
});

test("seller nav targets and role namespaces resolve to real pages", () => {
  const navText = read("src/lib/nav.ts");
  const requiredPages = [
    "src/app/home/logistics/page.tsx",
    "src/app/home/payments/page.tsx",
    "src/app/home/payouts/page.tsx",
    "src/app/home/inventory/page.tsx",
    "src/app/home/invoices/page.tsx",
    "src/app/home/reviews/page.tsx",
    "src/app/home/apps/page.tsx",
    "src/app/home/marketing/page.tsx",
    "src/app/home/discounts/page.tsx",
    "src/app/home/automations/page.tsx",
    "src/app/home/dropship/page.tsx",
    "src/app/home/customers/page.tsx",
    "src/app/home/insights/page.tsx",
    "src/app/home/analytics/page.tsx",
    "src/app/home/settings/page.tsx",
    "src/app/seller/inventory/page.tsx",
    "src/app/seller/invoices/page.tsx",
    "src/app/seller/reviews/page.tsx",
    "src/app/seller/apps/page.tsx",
    "src/app/supplier/dashboard/page.tsx",
    "src/app/supplier/onboarding/page.tsx",
    "src/app/supplier/products/page.tsx",
    "src/app/supplier/products/new/page.tsx",
    "src/app/supplier/products/[id]/edit/page.tsx",
    "src/app/supplier/orders/page.tsx",
    "src/app/supplier/quote-requests/page.tsx",
    "src/app/supplier/profile/page.tsx",
    "src/app/supplier/analytics/page.tsx",
    "src/app/logistics/dashboard/page.tsx",
    "src/app/logistics/onboarding/page.tsx",
    "src/app/logistics/profile/page.tsx",
    "src/app/logistics/coverage/page.tsx",
    "src/app/logistics/pricing/page.tsx",
    "src/app/logistics/bookings/page.tsx",
    "src/app/logistics/quotes/page.tsx",
    "src/app/logistics/analytics/page.tsx",
    "src/app/admin/dashboard/page.tsx",
    "src/app/admin/suppliers/page.tsx",
    "src/app/admin/supplier-products/page.tsx",
    "src/app/admin/logistics-partners/page.tsx",
    "src/app/admin/categories/page.tsx",
    "src/app/admin/marketplace/page.tsx",
    "src/app/admin/settings/page.tsx",
  ];

  // Every sidebar link must open a real page.
  for (const [, href] of navText.matchAll(/href: "([^"]+)"/g)) {
    assert.ok(exists(`src/app${href}/page.tsx`), `nav link ${href} should have a page`);
  }

  requiredPages.forEach((pagePath) => {
    assert.ok(exists(pagePath), `${pagePath} should exist`);
  });

  assert.match(navText, /href: "\/home\/logistics"/);
  assert.match(navText, /href: "\/home\/payments"/);
  assert.match(navText, /href: "\/home\/inventory"/);
  assert.match(navText, /href: "\/home\/invoices"/);
  assert.match(navText, /href: "\/home\/reviews"/);
  assert.doesNotMatch(navText, /href: "\/home\/apps"/);
  assert.match(navText, /href: "\/home\/marketing\/campaigns"/);
  assert.match(navText, /href: "\/home\/customers"/);
  assert.match(navText, /href: "\/home\/analytics"/);
  assert.match(navText, /href: "\/home\/settings"/);
  assert.doesNotMatch(navText, /href: "\/logistics"(?!\/)/);
  assert.doesNotMatch(navText, /href: "\/settings"(?!\/)/);
});

test("docs and public routes describe the WordPress sync contract", () => {
  const openApi = read("docs/openapi.yaml");
  const syncContract = read("SHOPINBOS_APP_SYNC.md");

  [
    "src/app/api/public/health/route.ts",
    "src/app/api/v1/public/health/route.ts",
    "src/app/api/public/products/search/route.ts",
    "src/app/api/v1/public/products/search/route.ts",
    "src/app/api/public/suppliers/search/route.ts",
    "src/app/api/v1/public/suppliers/search/route.ts",
    "src/app/api/public/logistics/partners/search/route.ts",
    "src/app/api/v1/public/logistics/partners/search/route.ts",
    "src/app/api/docs/route.ts",
  ].forEach((routePath) => {
    assert.ok(exists(routePath), `${routePath} should exist`);
  });

  assert.match(openApi, /x-canonical-base-path: \/api\/v1\/public/);
  assert.match(openApi, /x-legacy-base-path: \/api\/public/);
  assert.match(openApi, /\/api\/v1\/public\/health:/);
  assert.match(openApi, /\/api\/v1\/public\/products\/search:/);
  assert.match(openApi, /\/api\/v1\/public\/suppliers\/search:/);
  assert.match(openApi, /\/api\/v1\/public\/logistics\/partners\/search:/);
  assert.match(openApi, /\/api\/public\/health:/);
  assert.match(openApi, /\/api\/public\/products\/search:/);
  assert.match(openApi, /\/api\/public\/suppliers\/search:/);
  assert.match(openApi, /\/api\/public\/logistics\/partners\/search:/);
  assert.match(openApi, /required: \[data, pagination\]/);
  assert.match(openApi, /Pagination:\s*\n\s*type: object/);
  assert.match(openApi, /totalPages:/);
  assert.match(openApi, /hasNextPage:/);
  assert.match(openApi, /https:\/\/shopinbos\.com/);
  assert.match(syncContract, /WordPress is a read-only client/);
  assert.match(syncContract, /GET \/api\/v1\/public\/health/);
  assert.match(syncContract, /GET \/api\/public\/health/);
});

test("legacy pages redirect to canonical namespaces", () => {
  assert.match(read("src/app/supplier/quotes/page.tsx"), /redirect\("\/supplier\/quote-requests"\)/);
  assert.match(read("src/app/logistics/settings/page.tsx"), /redirect\("\/logistics\/profile"\)/);
  assert.match(read("src/app/admin/catalog/page.tsx"), /redirect\("\/admin\/supplier-products"\)/);
  assert.match(read("src/app/admin/logistics/page.tsx"), /redirect\("\/admin\/logistics-partners"\)/);
  assert.match(read("src/app/admin/orders/page.tsx"), /requireRole\(\["admin"\]/);
  assert.match(read("src/app/admin/users/page.tsx"), /requireRole\(\["admin"\]/);
});

test("supplier portal has payout recipients, public profiles, and message preferences", () => {
  const schema = read("prisma/schema.prisma");
  const supplierSettings = read("src/app/supplier/settings/page.tsx");
  const payments = read("src/app/actions/payments.ts");
  const supplierActions = read("src/app/actions/supplier.ts");
  const messages = read("src/app/api/conversations/[id]/messages/route.ts");
  const suppliersPage = read("src/app/suppliers/[slug]/page.tsx");
  const marketplaceSuppliers = read("src/app/marketplace/suppliers/page.tsx");

  assert.match(schema, /model SupplierPayoutAccount/);
  assert.match(schema, /paystackRecipientCode/);
  assert.match(schema, /model NotificationPreference/);
  assert.match(schema, /@@unique\(\[userId, eventKey, category\]\)/);

  assert.match(payments, /export async function linkSupplierPaystackRecipient/);
  assert.match(read("src/lib/payout-bank.ts"), /https:\/\/api\.paystack\.co\/transferrecipient/);
  assert.match(payments, /verificationStatus: recipient\.status/);

  assert.match(supplierActions, /export async function saveSupplierNotificationPreferences/);
  assert.match(supplierSettings, /Message notifications/);
  assert.match(supplierSettings, /messageEmail/);
  assert.match(supplierSettings, /messageSms/);

  // Partner messages notify through the conversations service: in-app at once, SMS if opted in, email if left unread.
  const conversations = read("src/lib/conversations/service.server.ts");
  assert.match(messages, /sendPartnerMessage/);
  assert.match(conversations, /sendPlatformEmail\(/, "unread messages are emailed through the shared email shell");
  assert.match(conversations, /sendSms/);
  assert.match(conversations, /eventKey: "message_received"/);

  assert.match(suppliersPage, /export async function generateMetadata/);
  assert.match(suppliersPage, /supplier\.verificationStatus === "verified"/);
  assert.match(suppliersPage, /robots: supplier\.verificationStatus === "verified" \? undefined : \{ index: false/);
  assert.match(suppliersPage, /Request quote/);
  assert.match(marketplaceSuppliers, /href=\{`\/suppliers\/\$\{s\.slug\}`\}/);
  assert.match(marketplaceSuppliers, /<ChatButton contactId=\{s\.id\}/);
});

test("admin actions cover moderation, trend control, and category management", () => {
  const adminActions = read("src/app/actions/admin.ts");

  assert.match(adminActions, /export async function updateSupplierVerification/);
  assert.match(adminActions, /export async function updateLogisticsVerification/);
  assert.match(adminActions, /export async function updateSupplierProductStatus/);
  assert.match(adminActions, /export async function updateSupplierProductTrend/);
  assert.match(adminActions, /export async function upsertCategory/);
  assert.match(adminActions, /invalidatePublicMarketplaceCache/);
});

test("onboarding memory is durable and shared with Rex builder", () => {
  const memory = read("src/lib/onboarding-memory.ts");
  const workspace = read("src/lib/workspace.ts");
  const storeRoute = read("src/app/api/app/store/route.ts");
  const onboarding = read("src/components/onboarding/OnboardingFlow.tsx");
  const onboardingCss = read("src/app/globals.css");
  const schema = read("prisma/schema.prisma");
  const schemas = read("src/lib/schemas/index.ts");
  const supplierOnboardingRoute = read("src/app/api/supplier/onboarding/route.ts");
  const logisticsOnboardingRoute = read("src/app/api/logistics/onboarding/route.ts");
  const storeRouteApp = read("src/app/api/app/store/route.ts");
  const supplierOnboardingComponent = read("src/components/onboarding/SupplierOnboarding.tsx");
  const supplierOnboarding = read("src/app/supplier/onboarding/page.tsx");
  const logisticsOnboarding = read("src/app/logistics/onboarding/page.tsx");
  const logisticsOnboardingComponent = read("src/components/onboarding/LogisticsOnboarding.tsx");
  const builder = read("src/components/builder/ChipBuilder.tsx");
  const builderPage = read("src/app/builder/page.tsx");
  const templatesPage = read("src/app/builder/templates/page.tsx");
  const templateGallery = read("src/components/builder/TemplateGallery.tsx");

  assert.match(memory, /export interface StoreOnboardingMemory/);
  assert.match(memory, /businessDescription\?: string/);
  assert.match(memory, /documentNotes\?: string/);
  assert.match(workspace, /onboardingMemory\?: StoreOnboardingMemory/);
  assert.match(workspace, /mergeOnboardingMemory\(parsed\.onboardingMemory, patch\.onboardingMemory\)/);
  assert.match(storeRoute, /mergeBrandSettings\(store\.brandSettings, body\[key\]/);

  assert.match(onboarding, /syncOnboardingMemoryToStore/);
  assert.match(onboarding, /\/api\/ai\/onboarding-rex/);
  assert.match(onboarding, /\/api\/ai\/transcribe/);
  assert.match(onboarding, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(onboarding, /documentNames/);
  assert.match(onboarding, /\["Meet Rex", "Name your store", "What you sell", "Build path"\]/);
  assert.match(onboarding, /const sellerStepsTotal = 10/);
  assert.match(onboarding, /Step 1 of \{sellerStepsTotal\}/);
  assert.match(onboarding, /onboardingState: "LIVE"/);
  assert.match(onboarding, /firstDashboardVisitComplete: true/);
  assert.doesNotMatch(onboarding, /Step 1 of 5/);
  assert.doesNotMatch(onboarding, /\/seller\/store\/builder/);
  assert.match(onboarding, /Build completely with Rex/);
  assert.match(onboarding, /Start from a template/);
  assert.match(onboarding, /\/api\/ai\/store-builder/);
  assert.match(onboarding, /shopinbos-builder-progress/);
  assert.match(onboarding, /Set up payments/);
  assert.match(onboarding, /Pick logistics/);
  assert.match(onboarding, /Launch/);
  assert.match(onboarding, /forcedRole/);
  assert.match(supplierOnboardingComponent, /export function SupplierOnboarding/);
  assert.match(supplierOnboardingComponent, /Submit for admin review/);
  assert.match(onboarding, /LogisticsOnboardingStage/);
  assert.match(onboarding, /Where do you operate\?/);
  assert.match(supplierOnboardingComponent, /Verify your business/);
  assert.match(supplierOnboardingComponent, /\/api\/supplier\/onboarding/);
  assert.match(onboarding, /\/api\/logistics\/onboarding/);
  assert.match(supplierOnboardingComponent, /manual admin verification/);
  assert.match(onboarding, /Save & exit/);
  assert.match(onboardingCss, /\.onb-step-header/);
  assert.match(onboardingCss, /\.phone-mini/);
  assert.match(onboardingCss, /\.steps \.s\.on/);
  assert.match(schema, /verificationDocuments\s+Json/);
  assert.match(schema, /coverageMap\s+Json/);
  assert.match(schemas, /SupplierOnboardingSchema/);
  assert.match(schemas, /LogisticsOnboardingSchema/);
  assert.match(supplierOnboardingRoute, /withSupplier/);
  assert.match(supplierOnboardingRoute, /verificationDocuments/);
  assert.match(supplierOnboardingRoute, /onboardingState/);
  assert.match(logisticsOnboardingRoute, /withLogistics/);
  assert.match(logisticsOnboardingRoute, /coverageMap/);
  assert.match(logisticsOnboardingRoute, /onboardingState/);
  assert.match(storeRouteApp, /"onboardingState"/);
  assert.match(storeRouteApp, /"firstDashboardVisitComplete"/);
  assert.match(supplierOnboarding, /initialSupplier/);
  // Logistics setup has its own page component; progress is durable on the partner row via the onboarding API.
  assert.match(logisticsOnboarding, /<LogisticsOnboarding/);
  assert.match(logisticsOnboarding, /requireRole\(\["logistics_partner"\]/);
  assert.match(logisticsOnboardingComponent, /fetch\("\/api\/logistics\/onboarding"\)/);
  assert.match(logisticsOnboardingComponent, /method: "PATCH"/);
  assert.match(logisticsOnboardingComponent, /coverageMap: \{ zones/);
  assert.match(logisticsOnboardingComponent, /completed,/);

  assert.match(builderPage, /onboardingMemory=\{workspace\.settings\.onboardingMemory \?\? null\}/);
  assert.match(builderPage, /params\?\.mode === "rex" \? "products" : undefined/);
  assert.match(builder, /readLocalOnboardingMemory/);
  assert.match(builder, /buildBrandContext/);
  assert.match(builder, /businessDescription/);
  assert.match(builder, /Do not ask the same setup questions again|what I remember/);
  assert.match(builder, /real products and product images/);

  // The onboarding category opens the matching chip while the seller picks their first theme.
  assert.match(templatesPage, /initialCategory=\{currentThemeId \? null : workspace\.settings\.onboardingMemory\?\.category\}/);
  assert.match(templateGallery, /initialCategory/);
  assert.match(templateGallery, /text\.includes\("food"\)/);
  assert.match(templateGallery, /TEMPLATE_ID_TO_IMAGE/);
  assert.match(templateGallery, /Or let Rex build one/);
});

test("auth experience keeps each portal focused and conversational", () => {
  const auth = read("src/components/auth/app/AppAuth.tsx");
  const authApi = read("src/components/auth/app/auth-api.ts");
  const otpRoute = read("src/app/api/auth/otp/route.ts");
  const serverAuth = read("src/lib/server-auth.ts");
  const authMiddleware = read("src/lib/auth/middleware.ts");
  const appUser = read("src/lib/auth/app-user.ts");
  const portalRoutes = read("src/lib/portal-routes.ts");
  const onboardingPage = read("src/app/onboarding/page.tsx");

  // Redesigned sign-in: phone (SMS) code, email code, password, Google; role tabs on sign up.
  assert.match(auth, /Your shop, live in 10 minutes/);
  assert.match(auth, /Start with my phone number/);
  // Phone codes go by SMS only (the Send SMS hook has no WhatsApp path), so nothing promises WhatsApp.
  assert.match(auth, /Send me a code by SMS/);
  assert.doesNotMatch(auth, /code on WhatsApp/);
  assert.match(auth, /Email me a code instead/);
  assert.match(auth, /current-password/);
  assert.match(auth, /Forgot password\?/);
  assert.match(auth, /Continue with Google/);
  assert.match(auth, /I supply shops/);
  assert.match(auth, /After you sign up, Rex adds this to your store/);
  assert.match(auth, /This account already belongs to a/);
  assert.match(authApi, /signInWithPassword/);
  assert.match(authApi, /signInWithOAuth\(\{\s*provider: "google"/);
  assert.match(authApi, /resetPasswordForEmail/);
  assert.match(otpRoute, /channel: "sms"/);
  assert.match(otpRoute, /shouldCreateUser: create/);
  assert.doesNotMatch(otpRoute, /role: "admin"/);
  assert.match(serverAuth, /ensureAppUserForSupabaseUser\(\{/);
  assert.match(serverAuth, /expectedRole/);
  assert.match(authMiddleware, /ensureAppUserForSupabaseUser/);
  assert.match(authMiddleware, /allowedRoles\?\.length === 1/);
  assert.match(appUser, /appUserInputFromSupabaseUser/);
  assert.match(appUser, /db\.supplier\.upsert/);
  assert.match(appUser, /db\.logisticsPartner\.upsert/);
  assert.match(portalRoutes, /supplier:[\s\S]*onboarding: "\/supplier\/onboarding"/);
  assert.match(portalRoutes, /logistics_partner:[\s\S]*onboarding: "\/logistics\/onboarding"/);
  assert.match(onboardingPage, /params\.role === "supplier"/);
  assert.match(onboardingPage, /portalOnboardingPath\("supplier"\)/);
});

test("inner portal pages use the mockup-style operational shell", () => {
  const rolePage = read("src/components/role/RolePage.tsx");
  const payments = read("src/app/home/payments/page.tsx");
  const logistics = read("src/app/home/logistics/page.tsx");

  assert.match(rolePage, /Shop focus/);
  assert.match(rolePage, /Factory focus/);
  assert.match(rolePage, /Ops focus/);
  assert.match(rolePage, /MetricTile/);
  assert.match(rolePage, /Search this list/);
  assert.match(rolePage, /dBtn-mint/);

  assert.match(payments, /Shopinbos handles checkout/);
  assert.match(payments, /Money in, last 30 days/);
  assert.match(payments, /Latest payments/);
  assert.match(payments, /How customers paid/);

  assert.match(logistics, /Book riders/);
  assert.match(logistics, /Delivery partners/);
  assert.match(logistics, /Quote requests/);
  assert.match(logistics, /QuoteRequestForm/);
});

test("supplier product pages provide a full submit and edit workflow", () => {
  const products = read("src/app/supplier/products/page.tsx");
  const newProduct = read("src/app/supplier/products/new/page.tsx");
  const editProduct = read("src/app/supplier/products/[id]/edit/page.tsx");
  const form = read("src/components/supplier/SupplierProductForm.tsx");
  const actions = read("src/app/actions/supplier.ts");
  const prismaConfig = read("prisma.config.ts");
  const sync = read("SHOPINBOS_APP_SYNC.md");

  assert.match(products, /send complete products to marketplace review/);
  assert.match(products, /href=\{`\/supplier\/products\/\$\{product\.id\}\/edit`\}/);
  assert.match(newProduct, /SupplierProductForm/);
  assert.match(newProduct, /createSupplierProduct/);
  assert.match(editProduct, /updateSupplierProduct/);
  assert.match(form, /Save draft/);
  assert.match(form, /send to review/);
  assert.match(form, /Tier pricing/);
  assert.match(form, /Image URLs/);
  assert.match(actions, /export async function createSupplierProduct/);
  assert.match(actions, /export async function updateSupplierProduct/);
  assert.match(actions, /SupplierProductCreateSchema/);
  assert.match(prismaConfig, /loadEnv\(\{ path: "\.env\.local", override: true \}\)/);
  assert.match(sync, /Build supplier product creation\/editing as a full workflow/);
});

test("supplier and logistics onboarding require manual verification before platform use", () => {
  const roleQueries = read("src/lib/role-queries.ts");
  const authSync = read("src/app/api/auth/sync-user/route.ts");
  const appUser = read("src/lib/auth/app-user.ts");
  const supplierRoute = read("src/app/api/supplier/onboarding/route.ts");
  const logisticsRoute = read("src/app/api/logistics/onboarding/route.ts");
  const supplierDashboard = read("src/app/supplier/dashboard/page.tsx");
  const logisticsDashboard = read("src/app/logistics/dashboard/page.tsx");
  const adminSuppliers = read("src/app/admin/suppliers/page.tsx");
  const adminLogistics = read("src/app/admin/logistics-partners/page.tsx");

  assert.match(roleQueries, /ensureSupplierAccess/);
  assert.match(roleQueries, /ensureLogisticsAccess/);
  assert.match(authSync, /ensureAppUserForSupabaseUser/);
  assert.match(appUser, /verificationStatus: "unverified"/);
  assert.match(appUser, /onboardingState: \{ source: "signup", completed: false \}/);
  assert.match(supplierRoute, /parsed\.data\.completed \? "pending" : "unverified"/);
  assert.match(logisticsRoute, /parsed\.data\.completed \? "pending" : "unverified"/);
  assert.match(supplierDashboard, /ensureSupplierAccess\(supplier\)/);
  assert.match(logisticsDashboard, /ensureLogisticsAccess\(partner\)/);
  assert.match(adminSuppliers, /Onboarding/);
  assert.match(adminSuppliers, /submitted/);
  assert.match(adminLogistics, /Onboarding/);
  assert.match(adminLogistics, /draft/);
});

test("supplier and logistics starter limits are enforced and shown in billing UI", () => {
  const supplierActions = read("src/app/actions/supplier.ts");
  const logisticsActions = read("src/app/actions/logistics.ts");
  const planLimits = read("src/lib/plan-limits.ts");
  const schema = read("prisma/schema.prisma");
  const supplierProductsRoute = read("src/app/api/supplier/products/route.ts");
  const logisticsRoute = read("src/app/api/logistics/onboarding/route.ts");
  const logisticsProfileRoute = read("src/app/api/logistics/profile/route.ts");
  const supplierNew = read("src/app/supplier/products/new/page.tsx");
  const supplierProfile = read("src/app/supplier/profile/page.tsx");
  const logisticsProfile = read("src/app/logistics/profile/page.tsx");
  const logisticsCouriers = read("src/app/logistics/couriers/page.tsx");
  const onboarding = read("src/components/onboarding/OnboardingFlow.tsx");

  assert.match(planLimits, /SUPPLIER_FREE_PRODUCT_LIMIT = 50/);
  assert.match(planLimits, /LOGISTICS_FREE_ROUTE_LIMIT = 4/);
  assert.match(planLimits, /LOGISTICS_FREE_TEAM_MEMBER_LIMIT = 3/);
  assert.match(schema, /model LogisticsTeamMember/);
  assert.match(schema, /@@unique\(\[logisticsPartnerId, email\]\)/);
  assert.match(supplierActions, /productCount >= SUPPLIER_FREE_PRODUCT_LIMIT/);
  assert.match(supplierActions, /Billing%20%26%20Plan&limit=products/);
  assert.match(supplierProductsRoute, /VERIFICATION_REQUIRED/);
  assert.match(supplierProductsRoute, /productCount >= SUPPLIER_FREE_PRODUCT_LIMIT/);
  assert.match(supplierProductsRoute, /PLAN_LIMIT/);
  assert.match(logisticsActions, /zoneCount > LOGISTICS_FREE_ROUTE_LIMIT/);
  assert.match(logisticsActions, /teamMemberCount >= LOGISTICS_FREE_TEAM_MEMBER_LIMIT/);
  assert.match(logisticsActions, /export async function addLogisticsTeamMember/);
  assert.match(logisticsActions, /export async function updateLogisticsTeamMemberStatus/);
  assert.match(logisticsActions, /Billing%20%26%20Plan&limit=routes/);
  assert.match(logisticsActions, /Billing%20%26%20Plan&limit=team/);
  assert.match(logisticsRoute, /coverageZones\.length > LOGISTICS_FREE_ROUTE_LIMIT/);
  assert.match(logisticsProfileRoute, /coverageZones\.length > LOGISTICS_FREE_ROUTE_LIMIT/);
  assert.match(logisticsCouriers, /addLogisticsTeamMember/);
  assert.match(logisticsCouriers, /Starter logistics includes \{LOGISTICS_FREE_TEAM_MEMBER_LIMIT\} active team members/);
  assert.match(logisticsCouriers, /updateLogisticsTeamMemberStatus/);
  assert.match(supplierNew, /Free product limit reached/);
  assert.match(onboarding, /completed: payload\.completed \?\? true/);
});

test("supplier quote and order pages support response and fulfilment workflows", () => {
  const quotes = read("src/app/supplier/quote-requests/page.tsx");
  const orders = read("src/app/supplier/orders/page.tsx");
  const actions = read("src/app/actions/supplier.ts");
  const sync = read("SHOPINBOS_APP_SYNC.md");

  assert.match(quotes, /respondToSupplierQuote/);
  assert.match(quotes, /name="quotedPrice"/);
  assert.match(quotes, /Send quote/);
  assert.match(quotes, /Quote health/);
  assert.match(quotes, /name="intent" value="reject"/);

  assert.match(orders, /updateSupplierOrderStatus/);
  assert.match(orders, /Mark shipped/);
  assert.match(orders, /name="trackingCode"/);
  assert.match(orders, /Tracking code/);
  assert.match(orders, /TO_SHIP/);

  assert.match(actions, /export async function respondToSupplierQuote/);
  assert.match(actions, /QuoteResponseSchema/);
  assert.match(actions, /status: "rejected"/);
  assert.match(actions, /export async function updateSupplierOrderStatus/);
  assert.match(actions, /OrderStatusUpdateSchema/);
  assert.match(sync, /\[x\] Build supplier quote response and order management flows/);
});

test("logistics pages support quote, booking, coverage, and pricing workflows", () => {
  const quotes = read("src/app/logistics/quotes/page.tsx");
  const bookings = read("src/app/logistics/bookings/page.tsx");
  const coverage = read("src/app/logistics/coverage/page.tsx");
  const pricing = read("src/app/logistics/pricing/page.tsx");
  const actions = read("src/app/actions/logistics.ts");
  const schemas = read("src/lib/schemas/index.ts");
  const sync = read("SHOPINBOS_APP_SYNC.md");

  assert.match(quotes, /respondToDeliveryQuote/);
  assert.match(quotes, /Price good until/);
  assert.match(quotes, /Send quote/);
  assert.match(quotes, /name="intent" value="reject"/);

  assert.match(bookings, /updateDeliveryBookingStatus/);
  assert.match(bookings, /Update job/);
  assert.match(bookings, /Tracking code/);
  assert.match(bookings, /Estimated delivery/);

  assert.match(coverage, /updateLogisticsCoverage/);
  assert.match(coverage, /Edit coverage/);
  assert.match(coverage, /name="coverageRows"/);
  assert.match(pricing, /updateLogisticsPricing/);
  assert.match(pricing, /Edit pricing/);
  assert.match(pricing, /What sellers see/);

  assert.match(actions, /export async function updateLogisticsCoverage/);
  assert.match(actions, /export async function updateLogisticsPricing/);
  assert.match(actions, /replyToQuote/);
  assert.match(read("src/lib/logistics/quotes.ts"), /DeliveryQuoteResponseSchema/);
  assert.match(actions, /BookingStatusUpdateSchema/);
  assert.match(schemas, /LogisticsCoverageUpdateSchema/);
  assert.match(schemas, /LogisticsPricingUpdateSchema/);
  assert.match(sync, /\[x\] Build logistics bookings, quotes, pricing, and coverage management flows/);
});

test("portal namespaces have shared empty, loading, and error states", () => {
  const states = read("src/components/role/PortalStates.tsx");
  const rolePage = read("src/components/role/RolePage.tsx");
  const sync = read("SHOPINBOS_APP_SYNC.md");

  [
    "src/app/home/loading.tsx",
    "src/app/home/error.tsx",
    "src/app/seller/loading.tsx",
    "src/app/seller/error.tsx",
    "src/app/supplier/loading.tsx",
    "src/app/supplier/error.tsx",
    "src/app/logistics/loading.tsx",
    "src/app/logistics/error.tsx",
  ].forEach((filePath) => {
    assert.ok(exists(filePath), `${filePath} should exist`);
  });

  const loading = read("src/components/shell/AppLoading.tsx");
  ["home", "seller", "supplier", "logistics", "admin", "products", "peggy"].forEach((segment) => {
    assert.match(read(`src/app/${segment}/loading.tsx`), /<AppLoading role=/, `${segment} uses the shared loading screen`);
  });
  assert.match(loading, /Opening \$\{name \|\| FALLBACK_NAME\[role\]\}/);
  assert.match(loading, /SLOW_AFTER_MS = 8000/);
  assert.match(loading, /Your network is slow/);
  assert.match(states, /export function PortalErrorState/);
  assert.match(states, /unstable_retry/);
  assert.match(rolePage, /We will surface the next item here when it arrives/);
  assert.match(rolePage, /Icon name="list"/);
  assert.match(sync, /\[x\] Add empty, loading, and error states across seller, supplier, and logistics portals/);
});

test("marketing website handoff docs include fetch examples and response shapes", () => {
  const guide = read("docs/marketing-site-integration.md");
  const examples = JSON.parse(read("docs/public-api-response-examples.json"));
  const sync = read("SHOPINBOS_APP_SYNC.md");

  assert.match(guide, /https:\/\/app\.shopinbos\.com\/api\/v1\/public/);
  assert.match(guide, /shopinbosFetch/);
  assert.match(guide, /\/products\/trending/);
  assert.match(guide, /\/suppliers/);
  assert.match(guide, /\/logistics\/partners/);
  assert.match(guide, /shopinbosAppLink/);
  assert.match(guide, /intent: "add"/);
  assert.match(guide, /intent: "book_delivery"/);
  assert.match(guide, /\/supplier\/signup/);
  assert.match(guide, /\/logistics\/signup/);

  assert.ok(examples.products.list.data[0].slug);
  assert.ok(examples.suppliers.list.data[0].slug);
  assert.ok(examples.logisticsPartners.list.data[0].slug);
  assert.ok(examples.categories.list.data[0].slug);
  assert.ok(examples.ctaLinks.sellerAddProduct.href.includes("intent=add"));
  assert.ok(examples.ctaLinks.logisticsBookDelivery.href.includes("intent=book_delivery"));
  assert.match(sync, /\[x\] Add a small marketing-site integration guide with example fetch calls/);
  assert.match(sync, /\[x\] Add API response examples for products, suppliers, logistics partners, categories, and CTA links/);
});

test("WordPress CTA links preserve intents and land on authenticated completion surfaces", () => {
  const routing = require(path.join(workspaceRoot, "src/lib/intent-routing.js"));
  const examples = JSON.parse(read("docs/public-api-response-examples.json"));
  const completionRoutes = [
    "src/app/api/app/store-products/add-from-supplier/route.ts",
    "src/app/api/app/dropship/start/route.ts",
    "src/app/api/app/wholesale/request/route.ts",
    "src/app/api/app/supplier-quotes/request/route.ts",
    "src/app/api/app/logistics/quotes/request/route.ts",
    "src/app/api/app/logistics/bookings/route.ts",
    "src/app/api/app/logistics/preferred-partner/route.ts",
  ];

  completionRoutes.forEach((routePath) => {
    assert.ok(exists(routePath), `${routePath} should exist`);
  });

  const ctas = examples.ctaLinks;
  const addUrl = new URL(ctas.sellerAddProduct.href);
  const quoteUrl = new URL(ctas.sellerRequestSupplierQuote.href);
  const supplierUrl = new URL(ctas.supplierViewProducts.href);
  const deliveryUrl = new URL(ctas.logisticsBookDelivery.href);
  const logisticsSignupUrl = new URL(ctas.logisticsPartnerSignup.href);

  [addUrl, quoteUrl, supplierUrl, deliveryUrl, logisticsSignupUrl].forEach((url) => {
    assert.equal(url.searchParams.get("source"), "wordpress");
  });

  assert.equal(addUrl.pathname, "/signup");
  assert.equal(addUrl.searchParams.get("intent"), "add");
  assert.equal(
    routing.getContinuationPath({
      role: "seller",
      intent: addUrl.searchParams.get("intent"),
      productSlug: addUrl.searchParams.get("productSlug"),
      source: "wordpress",
    }),
    "/marketplace?intent=add&productSlug=premium-ankara-fabric-bundle&source=wordpress",
  );

  assert.equal(quoteUrl.searchParams.get("intent"), "request_quote");
  assert.equal(
    routing.getContinuationPath({
      role: "seller",
      intent: quoteUrl.searchParams.get("intent"),
      productSlug: quoteUrl.searchParams.get("productSlug"),
      supplierSlug: quoteUrl.searchParams.get("supplierSlug"),
      source: "wordpress",
    }),
    "/marketplace?intent=request_quote&productSlug=premium-ankara-fabric-bundle&supplierSlug=lagos-fabric-works&source=wordpress",
  );

  assert.equal(supplierUrl.pathname, "/supplier/login");
  assert.equal(
    routing.getContinuationPath({
      role: "supplier",
      intent: supplierUrl.searchParams.get("intent"),
      supplierSlug: supplierUrl.searchParams.get("supplierSlug"),
      source: "wordpress",
    }),
    "/supplier/products?intent=view_products&supplierSlug=lagos-fabric-works&source=wordpress",
  );

  assert.equal(deliveryUrl.searchParams.get("intent"), "book_delivery");
  assert.equal(
    routing.getContinuationPath({
      role: "seller",
      intent: deliveryUrl.searchParams.get("intent"),
      logisticsSlug: deliveryUrl.searchParams.get("logisticsSlug"),
      source: "wordpress",
    }),
    "/home/logistics?intent=book_delivery&logisticsSlug=swiftlane-logistics&source=wordpress",
  );

  assert.equal(logisticsSignupUrl.pathname, "/logistics/signup");
  assert.equal(
    routing.getContinuationPath({
      role: "logistics_partner",
      intent: logisticsSignupUrl.searchParams.get("intent"),
      logisticsSlug: logisticsSignupUrl.searchParams.get("logisticsSlug"),
      source: "wordpress",
    }),
    "/logistics/profile?intent=connect_logistics&logisticsSlug=swiftlane-logistics&source=wordpress",
  );
});

test("auth sync preserves an existing portal role on login", () => {
  const syncUser = read("src/app/api/auth/sync-user/route.ts");

  assert.match(syncUser, /existingUser\?\.role \?\? effectiveRequestedRole/);
  assert.match(syncUser, /return NextResponse\.json\(\{ data: \{ id: user\.id, role: user\.role \} \}\)/);
});

test("proxy keeps auth cookies and sends protected portals to their own login", () => {
  const proxy = read("src/proxy.ts");
  const portalRoutes = read("src/lib/portal-routes.ts");
  const guestGuard = proxy.indexOf("if (matchesRoute(pathname, GUEST_ROUTES))");
  const authGuard = proxy.indexOf("if (!authenticated && matchesRoute(pathname, AUTH_ROUTES))");

  assert.ok(guestGuard > -1, "guest route guard should exist");
  assert.ok(authGuard > -1, "protected route guard should exist");
  assert.ok(guestGuard < authGuard, "guest routes must be handled before broad protected prefixes");
  assert.match(proxy, /"\/supplier\/signup"/);
  assert.match(proxy, /"\/logistics\/signup"/);
  assert.match(proxy, /createServerClient/);
  assert.match(proxy, /getLoginPath/);
  assert.match(proxy, /classifyHost\(/, "app hosts vs store hosts come from src/lib/storefront/host-routing.ts");
  assert.match(read("src/lib/storefront/host-routing.ts"), /LOCAL_HOSTS/);
  assert.match(proxy, /hasSupabaseAuthCookie/);
  assert.match(proxy, /portalLoginPath\(portalRoleFromPath\(pathname\)\)/);
  assert.match(proxy, /portalDashboardPath\(role\)/);
  assert.match(portalRoutes, /login: "\/supplier\/login"/);
  assert.match(portalRoutes, /login: "\/logistics\/login"/);
});

test("Rex AI routes use both providers (OpenAI and Claude) for onboarding chat, transcription, palettes, and builder", () => {
  const onboardingRex = read("src/app/api/ai/onboarding-rex/route.ts");
  const transcribe = read("src/app/api/ai/transcribe/route.ts");
  const palette = read("src/app/api/ai/generate-palette/route.ts");
  const storeBuilder = read("src/app/api/ai/store-builder/route.ts");

  assert.match(onboardingRex, /providerOrder\(\)/);
  assert.match(onboardingRex, /memoryPatch/);
  assert.match(transcribe, /gpt-4o-mini-transcribe/);
  assert.match(palette, /aiText\(/);
  assert.match(storeBuilder, /openai\.responses\.create/);
  assert.match(storeBuilder, /OPENAI_API_KEY or ANTHROPIC_API_KEY/);
});

test("seller goals and product variants keep scoped production behavior", () => {
  const goals = read("src/lib/goals/visibility.ts");
  const schemas = read("src/lib/schemas/index.ts");
  const productForm = read("src/app/products/new/NewProductForm.tsx");
  const productDetail = read("src/app/s/[slug]/product/[productId]/ProductDetailClient.tsx");
  const homeApps = read("src/app/home/apps/page.tsx");

  assert.match(goals, /export function canViewGoal/);
  assert.match(goals, /assigneeIds\?\.includes\(viewer\.id\)/);
  assert.match(goals, /mentioned\(kr\.title, viewer\)/);
  assert.match(goals, /mentioned\(kr\.description, viewer\)/);

  assert.match(schemas, /customFields: z\.array/);
  assert.match(schemas, /images: z\.array\(z\.string\(\)\)\.default\(\[\]\)/);
  assert.match(productForm, /uploadVariantImages/);
  assert.match(productForm, /Create category/);
  assert.match(productForm, /<Mascot who="peggy"/);
  assert.match(productDetail, /Variant details/);
  assert.match(productDetail, /selectedVariantFields/);
  assert.match(homeApps, /redirect\("\/home\/marketing"\)/);
});

test("launch QA regressions stay fixed", () => {
  const middleware = read("src/lib/auth/middleware.ts");
  const storefrontCheckout = read("src/app/s/[slug]/checkout/CheckoutClient.tsx");
  const checkoutRoute = read("src/app/api/public/store/[slug]/checkout/route.ts");
  const validateRoute = read("src/app/api/store/coupons/validate/route.ts");
  const schemas = read("src/lib/schemas/index.ts");
  const productsRoute = read("src/app/api/store/products/route.ts");
  const nextConfig = read("next.config.ts");

  assert.match(middleware, /params: \(await params\) \?\? \{\}/);
  assert.match(storefrontCheckout, /import \{ useRouter, useSearchParams \} from "next\/navigation"/);
  // Discount limits and expiry are enforced server-side in the pricing the checkout route charges with.
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(checkoutRoute, /priceOrder\(\{/);
  assert.match(pricing, /redemptionError\(discount, subtotal\)/);
  assert.match(pricing, /redemptionError\(coupon, subtotal\)/);
  assert.match(validateRoute, /redemptionError/);
  assert.match(schemas, /DiscountTypeSchema = z\.enum\(\["percentage", "fixed_amount", "free_shipping"\]\)/);
  assert.match(productsRoute, /\n\s+retailPrice,\n/);
  assert.match(nextConfig, /ignoreBuildErrors: false/);
});

test("seller insights are computed from real orders, not sample data", () => {
  const page = read("src/app/home/analytics/page.tsx");
  const lib = read("src/lib/insights.ts");

  assert.match(page, /computeSellerInsights\(orders\)/);
  assert.doesNotMatch(page, /revenueData|hoursData|"Lagos"|"₦1\.62M"|Peggy chat/);
  assert.match(lib, /export function computeSellerInsights/);
  assert.match(lib, /Africa\/Lagos/);
});

test("public profiles under portal prefixes stay reachable for guests and other roles", () => {
  const proxy = read("src/proxy.ts");
  const portalRoutes = read("src/lib/portal-routes.ts");

  assert.match(proxy, /const PUBLIC_ROUTES = \["\/logistics\/partners", "\/email", "\/rider"\]/);
  assert.match(proxy, /if \(matchesRoute\(pathname, PUBLIC_ROUTES\)\)/);
  // /suppliers/[slug] must not be caught by the /supplier portal gate.
  assert.doesNotMatch(proxy, /pathname\.startsWith\("\/supplier"\)/);
  assert.match(proxy, /matchesRoute\(pathname, \["\/supplier"\]\) && appUser\.role !== "supplier"/);
  assert.match(portalRoutes, /isUnder\(pathname, "\/supplier"\)/);
  assert.match(proxy, /_vercel/);
});

test("payments are verified with Paystack and bound to one order or plan", () => {
  const payments = read("src/app/actions/payments.ts");
  const orderPage = read("src/app/s/[slug]/order/[orderId]/page.tsx");
  const domainOrderPage = read("src/app/_domain/[domain]/order/[orderId]/page.tsx");

  // Confirmation pages must not mark orders paid from a URL parameter.
  for (const page of [orderPage, domainOrderPage]) {
    assert.doesNotMatch(page, /status: "paid"/);
    assert.match(page, /updateOrderPayment\(orderId, reference\)/);
  }
  assert.match(payments, /Payment does not belong to this order/);
  assert.match(payments, /Payment has already been applied to another order/);
  assert.match(payments, /process\.env\.NODE_ENV !== "production" && reference\.startsWith\("test-paystack-"\)/);
  // Plan upgrades: successful transaction, right plan, right amount, right payer, single use.
  assert.match(payments, /tx\.status !== "success"/);
  assert.match(payments, /Payment is not for this plan/);
  assert.match(payments, /Payment amount is less than the plan price/);
  assert.match(payments, /Payment was made by a different account/);
  assert.match(payments, /db\.paymentReceipt\.create/);
});

test("campaigns send through Resend with tracking, suppression and attribution", () => {
  const send = read("src/lib/campaigns/send.ts");
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  const stubRoute = read("src/app/api/store/campaigns/[id]/send/route.ts");

  assert.match(send, /status: \{ in: \["draft", "scheduled"\] \}/, "campaigns are claimed before sending");
  assert.match(send, /status: \{ not: "active" \}/, "unsubscribed contacts are suppressed");
  assert.match(send, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  assert.match(send, /extractCampaignLinks\(recipient\.campaign\.bodyHtml\)\.includes\(url\)/, "click tracking is not an open redirect");
  assert.match(checkout, /validCampaignToken\(store\.id, rawCampaignToken\)/);
  assert.match(webhook, /creditCampaignConversion\(ref\)/);
  assert.match(stubRoute, /sendCampaign\(store\.id, params\.id\)/);
});

test("2026 storefront themes are selectable templates with the shared shopper journey", () => {
  const catalog = read("src/lib/store-templates/catalog.ts");
  const themes = read("src/lib/store-templates/boutique-themes.ts");
  const surface = read("src/components/storefront/TemplateStorefrontSurface.tsx");
  const client = read("src/app/s/[slug]/StorefrontClient.tsx");
  const productPage = read("src/app/s/[slug]/product/[productId]/page.tsx");
  const domainProductPage = read("src/app/_domain/[domain]/product/[productId]/page.tsx");
  const productView = read("src/components/storefront/boutique/BoutiqueProductView.tsx");
  const publicStore = read("src/app/api/public/store/[slug]/route.ts");
  const lookup = read("src/app/api/public/store/[slug]/orders/lookup/route.ts");

  assert.match(catalog, /\.\.\.BOUTIQUE_TEMPLATE_MANIFESTS\]/);
  for (const id of ["breeze", "noir", "plain", "adire", "pantry", "ile", "plug", "stride"]) assert.match(themes, new RegExp(`id: "${id}"`));
  assert.doesNotMatch(themes, /unsplash|images\.pexels/, "no stock photos presented as the seller's");
  assert.match(surface, /isBoutiqueTheme\(themeId\)/);
  assert.match(client, /<ShopperBottomNav/);
  assert.match(client, /useStoreVisitBeacon\(previewMode \? "" : store\.slug\)/);
  assert.match(client, /useCampaignAttribution\(previewMode \? "" : store\.slug\)/);
  for (const page of [productPage, domainProductPage]) {
    assert.match(page, /loadProductPage\(/);
    assert.match(page, /generateMetadata/);
  }
  assert.match(productView, /shopper\.payOnDelivery \?/, "pay on delivery badge only when the seller enabled it");
  assert.match(productView, /shopper\.whatsappNumber/);
  assert.match(read("src/lib/storefront/public-store.server.ts"), /loadShopperInfo\(store\.id/);
  assert.match(lookup, /order numbers can't be probed/);
});

test("Your store hub links to Rex Studio, the builder, brand kit, templates and domain", () => {
  const nav = read("src/lib/nav.ts");
  const hub = read("src/app/home/store/page.tsx");
  const look = read("src/app/home/store/look.ts");
  const editorRedirect = read("src/app/home/editor/page.tsx");
  const brandKit = read("src/app/home/brand-kit/page.tsx");
  const brandControls = read("src/app/home/brand-kit/BrandKitControls.tsx");
  const domain = read("src/app/home/domain/DomainConnect.tsx");
  const builder = read("src/components/builder/ChipBuilder.tsx");

  assert.match(nav, /id: "your-store", label: "Your store", icon: "shop", href: "\/home\/store"/);
  assert.ok(exists("src/app/home/store/page.tsx"));
  assert.match(hub, /title="Your store"/);
  assert.match(hub, /href="\/studio"/);
  assert.match(hub, /`\/studio\?prompt=\$\{encodeURIComponent\(REBRAND_PROMPT\)\}`/);
  assert.match(look, /export const REBRAND_PROMPT = /);
  assert.match(hub, /href="\/seller\/store\/builder"/);
  assert.match(hub, /href="\/home\/brand-kit"/);
  assert.match(hub, /href="\/builder\/templates"/);
  assert.match(hub, /href="\/home\/domain"/);
  assert.match(hub, /<ShareStoreButton/);
  assert.match(hub, /<StorePreviewCard/);
  assert.match(editorRedirect, /redirect\(query \? `\/seller\/store\/builder\?\$\{query\}` : "\/seller\/store\/builder"\)/);

  assert.match(brandKit, /href="\/studio\/logo"/);
  assert.match(brandKit, /href="\/home\/brand-kit\/sheet"/);
  assert.match(brandControls, /\/api\/app\/me\/images/);
  assert.match(brandControls, /op: "update-theme"/);
  assert.match(domain, /<DomainSetup/);
  assert.match(builder, /router\.push\("\/home\/store"\)/);
  assert.doesNotMatch(builder, /\/builder\/editor/);
});
