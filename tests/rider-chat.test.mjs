// Riders talk in the app with their delivery company and with the shop on a job they carry, and customers rate their
// rider from a signed review link (shared/rider-chat.ts, src/lib/logistics/rider-messages.server.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { cleanRiderMessage, cleanRiderReview, ratingSummary, RIDER_MESSAGE_MAX } = await import("../shared/rider-chat.ts");

test("messages are trimmed and capped; empty ones aren't sent", () => {
  assert.equal(cleanRiderMessage("  On my way  "), "On my way");
  assert.equal(cleanRiderMessage("   "), null);
  assert.equal(cleanRiderMessage(42), null);
  assert.equal(cleanRiderMessage("x".repeat(RIDER_MESSAGE_MAX + 50)).length, RIDER_MESSAGE_MAX);
});

test("a rating is a whole 1-5 with an optional comment", () => {
  assert.deepEqual(cleanRiderReview({ rating: 5, comment: " Fast and polite " }), { rating: 5, comment: "Fast and polite" });
  assert.deepEqual(cleanRiderReview({ rating: "3" }), { rating: 3, comment: null });
  assert.equal(cleanRiderReview({ rating: 0 }), null);
  assert.equal(cleanRiderReview({ rating: 6 }), null);
  assert.equal(cleanRiderReview({ rating: 4.5 }), null);
});

test("the rating summary averages to one decimal", () => {
  assert.equal(ratingSummary([]), null);
  assert.deepEqual(ratingSummary([5, 4, 5]), { average: 4.7, count: 3 });
});

test("each side only reaches its own threads", () => {
  const server = read("src/lib/logistics/rider-messages.server.ts");
  // The rider only on jobs they carry, the shop only on jobs it booked, the company only with its own riders.
  assert.match(server, /side\.kind === "rider" && job\.riderId !== side\.riderId/);
  assert.match(server, /side\.kind === "shop" && job\.sellerId !== side\.userId/);
  assert.match(server, /logisticsPartnerId: side\.partnerId, role: "rider"/);
  // Review links are signed and checked in constant time, one rating per delivered job.
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /status !== "delivered"/);
  assert.match(server, /already rated/);
});

test("the apps wire it up: rider chat, the company and shop views, the review link and the customer's number", () => {
  const job = read("apps/mobile/src/app/rider/job.tsx");
  assert.match(job, /pathname: "\/rider\/chat", params: \{ with: "shop"/);
  assert.match(job, /riderReviewLink\(jobId\)/);
  assert.match(job, /sub=\{drop\.buyerPhone\}/);
  assert.match(read("apps/mobile/src/app/rider/(tabs)/me.tsx"), /with: "company"/);
  assert.match(read("apps/mobile/src/app/logistics/team/[id].tsx"), /\/logistics\/team\/chat\/\[id\]/);
  assert.match(read("apps/mobile/src/app/order/[id].tsx"), /\/delivery\/rider-chat/);
  assert.match(read("src/app/api/public/rider-review/route.ts"), /checkRateLimitShared/);
});

test("the migration adds both tables and only adds", () => {
  const sql = read("docs/migrations/2026-12-12-rider-messages-reviews.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "RiderMessage"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "RiderReview"/);
  assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
});
