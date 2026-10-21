// Add-ons and boosts (shared/plan-extras.ts, src/lib/plans/extras.server.ts), supplier CSV upload
// (shared/supplier-import.ts), and source checks for staff, message packs, rate cards, pickup points, the
// exceptions inbox, supplier follows and the chatbot's monthly cap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const extras = await import("../shared/plan-extras.ts");
const pricing = await import("../shared/platform-pricing.ts");
const supplierImport = await import("../shared/supplier-import.ts");

const book = pricing.resolvePriceBook({}, {});

test("add-on and boost prices come from the price book", () => {
  assert.equal(extras.extraUnitPrice(book, "staff_seat"), 1000);
  assert.equal(extras.extraUnitPrice(book, "sms_pack"), 4000);
  assert.equal(extras.extraUnitPrice(book, "whatsapp_pack"), 5000);
  assert.equal(extras.extraUnitPrice(book, "supplier_boost"), 3000);
  assert.equal(extras.extraUnitPrice(book, "logistics_boost"), 2000);
  assert.equal(extras.extraUnitPrice(book, "product_boost"), 1000);
  assert.equal(extras.MESSAGES_PER_PACK, 500);
  assert.equal(extras.EXTRA_ROLE.staff_seat, "seller");
  assert.equal(extras.EXTRA_ROLE.logistics_boost, "logistics_partner");
  assert.equal(extras.cleanExtraQuantity("3"), 3);
  assert.equal(extras.cleanExtraQuantity(0), null);
  assert.equal(extras.cleanExtraQuantity(13), null);
  assert.equal(extras.cleanExtraQuantity(1.5), null);
});

test("boosts queue after the one running; seats run side by side; packs never expire", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const later = new Date("2026-11-05T00:00:00Z");
  const boost = extras.extraWindow("supplier_boost", 2, later, now);
  assert.equal(boost.startsAt.toISOString(), later.toISOString());
  assert.equal(boost.endsAt.getTime() - later.getTime(), 14 * 86_400_000);
  const seat = extras.extraWindow("staff_seat", 3, later, now);
  assert.equal(seat.startsAt.toISOString(), now.toISOString(), "a second seat starts now, not after the first");
  assert.equal(seat.endsAt.getTime() - now.getTime(), 30 * 86_400_000);
  assert.deepEqual(extras.extraWindow("sms_pack", 1, null, now), { startsAt: null, endsAt: null });
  assert.equal(extras.messagesLeft(200, 150, 500), 550);
  assert.equal(extras.messagesLeft(200, 250, 0), 0);
});

test("supplier CSV: good rows go in, each bad row says why", () => {
  const categories = [{ id: "c1", name: "Fashion", slug: "fashion" }];
  const { products, errors } = supplierImport.parseSupplierImport(
    [
      { Name: "Ankara wrap dress", Description: "Hand-made Ankara wrap dress, sizes 8 to 16.", Category: "fashion", "Image URLs": "https://x.test/a.jpg | https://x.test/b.jpg", "Wholesale price": "₦12,000", MOQ: "5", Stock: "40", Dropship: "yes" },
      { Name: "No picture", Description: "A product with no image link here.", Category: "Fashion", "Image URLs": "", "Wholesale price": "1000" },
      { Name: "Odd category", Description: "Category that doesn't exist at all.", Category: "Cars", "Image URLs": "https://x.test/c.jpg", "Wholesale price": "1000" },
      { Name: "", Description: "", Category: "" },
    ],
    categories,
  );
  assert.equal(products.length, 1);
  const product = products[0].product;
  assert.equal(product.categoryId, "c1");
  assert.equal(product.wholesalePrice, 12000);
  assert.equal(product.suggestedRetailPrice, 18000, "retail defaults to 1.5× wholesale");
  assert.deepEqual(product.images, ["https://x.test/a.jpg", "https://x.test/b.jpg"]);
  assert.equal(product.moq, 5);
  assert.equal(product.dropshipAvailable, true);
  assert.deepEqual(errors.map((e) => e.row), [2, 3], "blank rows are skipped silently");
});

test("wiring: staff, packs, boosts, rate cards, pickup points, exceptions, follows, chatbot cap", () => {
  const acting = read("src/lib/staff/acting.server.ts");
  assert.match(acting, /OWNER_ONLY_API = \[[^\]]*"\/api\/app\/payout-bank"/);
  assert.match(read("src/lib/auth/middleware.ts"), /acting\.staff && isOwnerOnlyPath\(req\.nextUrl\.pathname, OWNER_ONLY_API\)/);
  assert.match(read("src/lib/server-auth.ts"), /actingUser\(user/);
  assert.match(read("src/proxy.ts"), /storeStaff\.findFirst/);
  assert.match(read("src/app/actions/payments.ts"), /user\.staff\) return \{ success: false, error: "Only the store owner can change the plan\." \}/);
  const staff = read("src/lib/staff/staff.server.ts");
  assert.match(staff, /seats\.used >= seats\.total/);
  assert.match(staff, /This account has its own store/);

  const channels = read("src/lib/marketing/channels.ts");
  assert.equal((channels.match(/spendPlatformMessage\(/g) ?? []).length, 2, "platform SMS and WhatsApp both count");
  assert.equal((channels.match(/returnPlatformMessage\(/g) ?? []).length, 2, "and are given back when the provider fails");

  const server = read("src/lib/plans/extras.server.ts");
  assert.match(server, /metadata\.purpose !== "plan_extra"/);
  assert.match(server, /Number\(verified\.amount\) !== row\.amountKobo/);
  assert.match(server, /where: \{ reference, status: "pending" \},\s*data: \{ status: "paid"/, "credited once");
  assert.match(server, /if \(moved\.count !== 1\) return;/);
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /ref\.startsWith\(EXTRA_REFERENCE_PREFIX\)/);
  assert.match(read("src/app/marketplace/suppliers/page.tsx"), /isFeatured\(b\) - isFeatured\(a\)/);
  assert.match(read("src/app/api/public/products/route.ts"), /markFeatured\(products, await boostedProductIds\(\)\)/);

  assert.match(read("src/app/api/app/logistics/bookings/route.ts"), /privateRateFor\(user\.id, partner\.id/);
  assert.match(read("src/lib/plans/rate-cards.server.ts"), /customerMayUse/);
  assert.match(read("src/lib/logistics/payin-deadline.ts"), /partner\.acceptsCod !== false/);
  assert.match(read("src/app/actions/logistics-plan.ts"), /count >= limits\.pickupPoints/);

  const exceptions = read("src/lib/logistics/exceptions.server.ts");
  assert.match(exceptions, /booking\.feePaidAt \|\| \(booking\.codCollected \?\? 0\) > 0/, "never moves a paid job");
  assert.match(exceptions, /deliveryPartnerProblem\(sellerId, partner\.id\)/);
  assert.match(read("src/app/actions/delivery-exceptions.ts"), /limits\.exceptionsInbox/);

  assert.match(read("src/app/actions/supplier.ts"), /if \(!limits\.bulkUpload\)/);
  assert.match(read("src/lib/suppliers/follow.server.ts"), /\.broadcast\) throw new FollowError/);

  const service = read("src/lib/inbox/service.ts");
  assert.match(service, /chatbotMayAnswer\(conversation\.storeId, bot\)/);
  assert.equal((service.match(/chargeChatbotReply\(conversation\.storeId\)/g) ?? []).length, 2, "live chat and WhatsApp AI replies cost credits");
  assert.match(read("src/lib/inbox/chatbot-budget.server.ts"), /bot\.monthlyCap > 0 && \(await aiBotRepliesThisMonth/);

  const sql = read("docs/migrations/2026-11-16-plan-extras.sql");
  for (const table of ["PlanExtraPurchase", "MessageBalance", "StoreStaff", "LogisticsPickupPoint", "PrivateRateCard", "SupplierFollow", "SupplierBroadcast"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), table);
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`), table);
  }
  assert.match(sql, /"acceptsCod" BOOLEAN NOT NULL DEFAULT true/);
});
