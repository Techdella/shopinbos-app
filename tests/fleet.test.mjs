// Sellers' own riders ("My riders", src/lib/logistics/fleet.server.ts) and invited delivery companies
// (src/lib/logistics/invites.server.ts): private fleets stay private, own riders' cash is never a Shopinbos pay-in,
// and an invite only links the company that accepted it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a seller's fleet is never listed or bookable as a partner", () => {
  for (const path of [
    "src/app/marketplace/logistics/page.tsx",
    "src/app/supplier/dashboard/page.tsx",
    "src/app/api/public/logistics/partners/route.ts",
    "src/app/api/public/logistics/partners/[slug]/route.ts",
    "src/app/api/app/logistics/preferred-partner/route.ts",
    "src/app/api/app/logistics/quotes/route.ts",
    "src/app/api/app/logistics/bookings/route.ts",
    "src/app/home/logistics/page.tsx",
    "src/app/home/shipping/page.tsx",
    "src/app/home/messages/page.tsx",
    "src/lib/workspace.ts",
    "src/app/admin/logistics-partners/page.tsx",
    "src/lib/supplier-orders/pickup.server.ts",
  ]) {
    assert.match(read(path), /ownerId: null/, path);
  }
});

test("own riders' cash belongs to the seller: no pay-ins, and the seller is told to collect it", () => {
  assert.match(read("src/lib/logistics/payin-standing.server.ts"), /logisticsPartner: \{ ownerId: null \}/);
  assert.match(read("src/lib/notifications/events.server.ts"), /Collect it from your rider\./);
});

test("only the seller's own riders get their deliveries, and riders log in by private link", () => {
  const fleet = read("src/lib/logistics/fleet.server.ts");
  // Every rider lookup goes through the seller's own fleet.
  assert.match(fleet, /findUnique\(\{ where: \{ ownerId: sellerId \}/);
  assert.match(fleet, /where: \{ id: riderId, logisticsPartnerId: fleet\.id, role: "rider", status: "active" \}/);
  // Links: a fresh random token, only its hash stored.
  assert.match(fleet, /const \{ token, hash \} = newRiderToken\(\)/);
  assert.match(fleet, /data: \{ riderTokenHash: hash \}/);
  // Removing a rider kills their link; not while deliveries are on the way.
  assert.match(fleet, /status: "inactive", riderTokenHash: null/);
  // Free, and on an order the buyer's delivery code is required.
  assert.match(fleet, /deliveryFee: 0/);
  assert.match(fleet, /deliveryCode: input\.orderId \? makeDeliveryCode\(\) : null/);
});

test("invites: one company per invite, accepted only by a signed-in delivery company", () => {
  const invites = read("src/lib/logistics/invites.server.ts");
  assert.match(invites, /where: \{ id: invite\.id, status: "pending" \}, data: \{ status: "accepted"/);
  assert.match(invites, /Another delivery company already accepted this invite\./);
  assert.match(invites, /where: \{ userId: partnerUserId, carrier: null, ownerId: null \}/);
  // Preferred partner only when the seller has none.
  assert.match(invites, /if \(store && !logistics\.preferredPartnerId\)/);
  const action = read("src/app/invite/delivery/[code]/actions.ts");
  assert.match(action, /if \(user\.role !== "logistics_partner"\)/);
});

test("sign-up and login come back to the invite", () => {
  const page = read("src/app/invite/delivery/[code]/page.tsx");
  assert.match(page, /\/logistics\/signup\?next=\$\{encodeURIComponent\(back\)\}/);
  assert.match(page, /\/logistics\/login\?next=\$\{encodeURIComponent\(back\)\}/);
});

test("riders and invites are translated in every language", async () => {
  const keys = ["fleet.title", "fleet.linkMessage", "fleet.openJobs", "invite.title", "invite.page.title", "invite.page.accept"];
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const messages = (await import(`../shared/i18n/messages/shipping/${lang}.ts`)).default;
    for (const key of keys) assert.ok(messages[key], `${lang}: ${key}`);
  }
});

test("riders by plan: Starter 3, Growth 15, Pro 50; suppliers 3 free, 50 on Supplier Max", () => {
  const limits = read("src/lib/plan-limits.ts");
  assert.match(limits, /RIDER_LIMITS = \{ starter: 3, growth: 15, pro: 50, supplier_free: 3, supplier_max: 50 \}/);
  assert.match(limits, /credits >= 200 \? RIDER_LIMITS\.pro : credits >= 50 \? RIDER_LIMITS\.growth : RIDER_LIMITS\.starter/);
  const fleet = read("src/lib/logistics/fleet.server.ts");
  assert.match(fleet, /const plan = await fleetRiderLimit\(sellerId\);\n  if \(count >= plan\.limit\) throw new FleetError\(plan\.message\);/);
});

test("suppliers get their own riders and invites, never tied to a shop order", () => {
  for (const path of [
    "src/app/api/supplier/logistics/my-riders/route.ts",
    "src/app/api/supplier/logistics/my-riders/[id]/route.ts",
    "src/app/api/supplier/logistics/my-riders/[id]/link/route.ts",
    "src/app/api/supplier/logistics/my-riders/jobs/route.ts",
    "src/app/api/supplier/logistics/my-riders/jobs/[id]/route.ts",
    "src/app/api/supplier/logistics/invites/route.ts",
    "src/app/api/supplier/logistics/invites/[id]/route.ts",
  ]) {
    const route = read(path);
    assert.match(route, /withSupplier\(/, path);
    assert.doesNotMatch(route, /withSeller/, path);
  }
  assert.match(read("src/app/api/supplier/logistics/my-riders/jobs/route.ts"), /\{ \.\.\.parsed\.data, orderId: null \}/);
  assert.match(read("src/app/supplier/delivery/page.tsx"), /logisticsPartner: \{ ownerId: user\.id \}/);
  // A company the supplier invited collects their pickups, after the shop's own choice.
  assert.match(read("src/lib/supplier-orders/pickup.server.ts"), /linkedPartnerIds\(order\.supplier\.userId\)/);
});
