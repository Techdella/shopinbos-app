// Price promotions (shared/price-promotions.ts, src/lib/pricing/promotions.server.ts, /admin/pricing/promotions):
// when a promotion is live, what it overrides, the checks an admin's promotion must pass, overlaps, the words people
// see, and source checks for the cache, the announcements and the cron.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const promos = await import("../shared/price-promotions.ts");
const pricing = await import("../shared/platform-pricing.ts");

const at = (iso) => new Date(iso);
const base = pricing.resolvePriceBook({ "store_fee.growth": 1.5 });
const blackFriday = { id: "bf", name: "Black Friday", status: "scheduled", startsAt: at("2026-11-27T00:00:00+01:00"), endsAt: at("2026-12-01T00:00:00+01:00"), prices: { "ads.setup.meta": 15000, "ads.setup.tiktok": 25000 } };

test("a promotion is upcoming, live, then ended; cancelled stays cancelled", () => {
  assert.equal(promos.promotionState(blackFriday, at("2026-11-26T23:59:00+01:00")), "upcoming");
  assert.equal(promos.promotionState(blackFriday, at("2026-11-27T00:00:00+01:00")), "live", "starts on the dot");
  assert.equal(promos.promotionState(blackFriday, at("2026-12-01T00:00:00+01:00")), "ended", "ends on the dot");
  assert.equal(promos.promotionState({ ...blackFriday, status: "cancelled" }, at("2026-11-28T00:00:00+01:00")), "cancelled");
});

test("live promotions override the price book, then prices go back by themselves", () => {
  const during = promos.livePromotionOverrides([blackFriday], at("2026-11-28T12:00:00+01:00"));
  assert.deepEqual(during, { "ads.setup.meta": 15000, "ads.setup.tiktok": 25000 });
  const book = pricing.resolvePriceBook({ "store_fee.growth": 1.5 }, {}, during);
  assert.equal(book["ads.setup.meta"], 15000);
  assert.equal(book["store_fee.growth"], 1.5, "prices it doesn't touch stay");
  assert.deepEqual(promos.livePromotionOverrides([blackFriday], at("2026-12-02T00:00:00+01:00")), {});
  // Overlapping on the same price: the one that started last wins.
  const flash = { ...blackFriday, id: "flash", startsAt: at("2026-11-28T00:00:00+01:00"), prices: { "ads.setup.meta": 10000 } };
  assert.equal(promos.livePromotionOverrides([flash, blackFriday], at("2026-11-28T12:00:00+01:00"))["ads.setup.meta"], 10000);
  // Junk in stored prices is dropped, never applied.
  assert.deepEqual(promos.readPromoPrices({ "ads.setup.meta": -5, nonsense: 1, "store_fee.growth": "2" }), { "store_fee.growth": 2 });
});

test("the cache runs out when a promotion starts or ends", () => {
  const now = at("2026-11-20T00:00:00+01:00");
  assert.equal(promos.nextPromotionBoundary([blackFriday], now).getTime(), blackFriday.startsAt.getTime());
  assert.equal(promos.nextPromotionBoundary([blackFriday], at("2026-11-28T00:00:00+01:00")).getTime(), blackFriday.endsAt.getTime());
  assert.equal(promos.nextPromotionBoundary([{ ...blackFriday, status: "cancelled" }], now), null);
});

test("an admin's promotion is checked", () => {
  const now = at("2026-11-01T00:00:00+01:00");
  const good = { name: "BF", headline: "Black Friday", message: null, startsAt: blackFriday.startsAt, endsAt: blackFriday.endsAt, audience: ["seller"], prices: { "ads.setup.meta": 15000 }, announceEmail: true, announceNotice: true };
  assert.equal(promos.promotionProblem(good, base, now), null);
  assert.match(promos.promotionProblem({ ...good, headline: " " }, base, now), /headline/);
  assert.match(promos.promotionProblem({ ...good, endsAt: good.startsAt }, base, now), /end after it starts/);
  assert.match(promos.promotionProblem({ ...good, endsAt: at("2027-06-01T00:00:00+01:00") }, base, now), /92 days/);
  assert.match(promos.promotionProblem({ ...good, audience: [] }, base, now), /who it's for/);
  assert.match(promos.promotionProblem({ ...good, prices: {} }, base, now), /at least one price/);
  assert.match(promos.promotionProblem({ ...good, prices: { "ads.setup.meta": 20000 } }, base, now), /same as today's/);
  assert.match(promos.promotionProblem({ ...good, startsAt: at("2026-10-01T00:00:00+01:00"), endsAt: at("2026-10-05T00:00:00+01:00") }, base, now), /already passed/);
  assert.match(promos.promotionProblem({ ...good, startsAt: promos.fromLagosInput("bad") }, base, now), /starts and ends/);
});

test("two promotions can't change the same price at the same time", () => {
  const now = at("2026-11-01T00:00:00+01:00");
  const input = { startsAt: at("2026-11-29T00:00:00+01:00"), endsAt: at("2026-12-05T00:00:00+01:00"), prices: { "ads.setup.meta": 12000 } };
  assert.equal(promos.overlappingPromotions(input, [blackFriday], now).length, 1);
  assert.equal(promos.overlappingPromotions({ ...input, prices: { "credits.small.naira": 1500 } }, [blackFriday], now).length, 0, "different prices can overlap");
  assert.equal(promos.overlappingPromotions({ ...input, startsAt: blackFriday.endsAt }, [blackFriday], now).length, 0, "back to back is fine");
  assert.equal(promos.overlappingPromotions(input, [{ ...blackFriday, status: "cancelled" }], now).length, 0);
});

test("what people see: old and new prices, who it's for, Lagos times", () => {
  const changes = promos.promotionChanges({ "ads.setup.meta": 15000, "credits.medium.credits": 700, "delivery.enabled": "on" }, base);
  assert.deepEqual(changes.map((c) => [c.key, c.from, c.to, c.direction]), [
    ["ads.setup.meta", "₦20,000", "₦15,000", "drop"],
    ["credits.medium.credits", "550 credits", "700 credits", "rise"],
    ["delivery.enabled", "Off (0%)", "On", "change"],
  ]);
  assert.deepEqual(promos.suggestedAudience(["ads.setup.meta"]), ["seller"]);
  assert.deepEqual(promos.suggestedAudience(["supplier_fee.plus", "boosts.supplier_week"]), ["supplier"]);
  assert.deepEqual(promos.suggestedAudience(["boosts.logistics_state_week"]), ["logistics_partner"]);
  assert.deepEqual(promos.suggestedAudience(["credits.small.naira", "delivery.plus"]).sort(), ["logistics_partner", "seller", "supplier"]);
  assert.match(promos.announcementBody({ headline: "BF", message: "Big savings", startsAt: blackFriday.startsAt, endsAt: blackFriday.endsAt }, changes), /Big savings[\s\S]*- Ad campaigns, setup fee: Facebook & Instagram: ₦20,000 → ₦15,000[\s\S]*Lagos time/);
  assert.equal(promos.fromLagosInput("2026-11-27T00:00").toISOString(), "2026-11-26T23:00:00.000Z");
  assert.equal(promos.toLagosInput(at("2026-11-26T23:00:00Z")), "2026-11-27T00:00");
});

test("wiring: the book applies promotions, saves clear the cache, the cron sends notices once", () => {
  const book = read("src/lib/pricing/price-book.server.ts");
  assert.match(book, /livePromotionOverrides\(promos, now\)/);
  assert.match(book, /nextPromotionBoundary/);
  const server = read("src/lib/pricing/promotions.server.ts");
  assert.match(server, /dedupeKey: `price-promotion:\$\{promo\.id\}`/, "a retried batch never notifies twice");
  assert.match(server, /startBroadcast\(broadcastId, \{ scheduledAt: at \}\)/, "the email waits for the start, via the cron");
  assert.match(server, /promotionState\(current\) !== "upcoming"/, "started promotions can't be edited");
  assert.match(server, /overlappingPromotions/);
  assert.match(read("src/app/api/cron/product-news/route.ts"), /runPromotionNotices/);
  assert.match(read("shared/notifications.ts"), /"pricing\.promotion": \{ category: "marketing" \}/);
  assert.match(read("src/app/actions/pricing.ts"), /export async function savePromotion[\s\S]*requireAdminSection\("money"\)/);
  assert.match(read("src/app/admin/pricing/promotions/page.tsx"), /requireRole\(\["admin"\]/);
  for (const page of ["src/app/home/page.tsx", "src/app/supplier/dashboard/page.tsx", "src/app/logistics/dashboard/page.tsx", "src/app/home/credits/page.tsx"]) assert.match(read(page), /<PromoBanner role=/, page);
  const sql = read("docs/migrations/2026-11-10-price-promotions.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "PricePromotion"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});
