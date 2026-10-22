// Status (24-hour stories between sellers, suppliers and delivery partners): who sees whom, feed order and cap,
// expiry, buttons per role, plain-text cleaning and photo URLs (shared/status.ts); the supplier "Track" steps
// (shared/supplier-track.ts); and source checks on the routes, the purge cron, the reward hook and the migration.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const s = await import("../shared/status.ts");
const t = await import("../shared/supplier-track.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ─── Audience ────────────────────────────────────────────────────────────────

test("audience: sellers see suppliers and partners; suppliers see partners and their sellers; partners see both", () => {
  assert.deepEqual([...s.audienceRoles("seller")].sort(), ["logistics_partner", "supplier"]);
  assert.deepEqual([...s.audienceRoles("supplier")].sort(), ["logistics_partner", "seller"]);
  assert.deepEqual([...s.audienceRoles("logistics_partner")].sort(), ["seller", "supplier"]);
  assert.deepEqual([...s.audienceRoles("admin")], []);
  const me = (role) => ({ userId: "me", role });
  const them = (role) => ({ userId: "them", role });
  assert.equal(s.canSee(me("seller"), them("supplier"), false), true);
  assert.equal(s.canSee(me("seller"), them("logistics_partner"), false), true);
  assert.equal(s.canSee(me("seller"), them("seller"), true), false, "never the viewer's own role");
  assert.equal(s.canSee(me("supplier"), them("seller"), false), false, "a supplier only sees sellers who sell its products");
  assert.equal(s.canSee(me("supplier"), them("seller"), true), true);
  assert.equal(s.canSee(me("supplier"), them("supplier"), true), false);
  assert.equal(s.canSee(me("logistics_partner"), them("seller"), false), true);
  assert.equal(s.canSee(me("logistics_partner"), them("supplier"), false), true);
  assert.equal(s.canSee(me("seller"), { userId: "me", role: "supplier" }, true), false, "never yourself");
  assert.equal(s.canSee(me("admin"), them("supplier"), true), false);
});

test("feed: relationships, then the same state, then newest; capped; unseen authors first; never my own", () => {
  const at = (h) => new Date(Date.UTC(2026, 10, 18, h)).toISOString();
  const candidates = [
    { userId: "other-new", tier: 2, seen: false, latestAt: at(10) },
    { userId: "state-old", tier: 1, seen: false, latestAt: at(1) },
    { userId: "tie-seen", tier: 0, seen: true, latestAt: at(9) },
    { userId: "tie-new", tier: 0, seen: false, latestAt: at(8) },
    { userId: "me", tier: 0, seen: false, latestAt: at(11) },
  ];
  assert.deepEqual(s.rankFeed(candidates, "me").map((c) => c.userId), ["tie-new", "state-old", "other-new", "tie-seen"]);
  // The cap keeps the closest authors, then unseen ones go first.
  assert.deepEqual(s.rankFeed(candidates, "me", 2).map((c) => c.userId), ["tie-new", "tie-seen"]);
  assert.equal(s.STATUS_FEED_AUTHORS, 30);
  const many = Array.from({ length: 50 }, (_, i) => ({ userId: `u${i}`, tier: 2, seen: false, latestAt: at(1) }));
  assert.equal(s.rankFeed(many, "me").length, 30);
  assert.equal(s.audienceTier({ related: true, sameState: false }), 0);
  assert.equal(s.audienceTier({ related: false, sameState: true }), 1);
  assert.equal(s.audienceTier({ related: false, sameState: false }), 2);
});

test("states: from the city and a partner's areas; regions and nationwide don't count as the same state", () => {
  assert.deepEqual([...s.statesOf(["Ikeja"])], ["Lagos"]);
  assert.deepEqual([...s.statesOf(["Lagos: Lekki", "Abuja", null, ""])].sort(), ["FCT", "Lagos"]);
  assert.deepEqual([...s.statesOf(["Nationwide", "South-West"])], []);
  assert.deepEqual([...s.statesOf(["12 Allen Avenue, Ikeja"])], ["Lagos"]);
  assert.equal(s.sharesState(s.statesOf(["Kano"]), s.statesOf(["Lagos", "Kano: Zoo Road"])), true);
  assert.equal(s.sharesState(s.statesOf(["Kano"]), s.statesOf(["Lagos"])), false);
});

// ─── Expiry ──────────────────────────────────────────────────────────────────

test("expiry: a post lives exactly 24 hours", () => {
  const created = new Date("2026-11-18T10:00:00Z");
  const expires = s.statusExpiresAt(created);
  assert.equal(expires.toISOString(), "2026-11-19T10:00:00.000Z");
  assert.equal(s.isLive({ expiresAt: expires }, new Date("2026-11-19T09:59:59Z")), true);
  assert.equal(s.isLive({ expiresAt: expires }, new Date("2026-11-19T10:00:00Z")), false);
  assert.equal(s.isLive({ expiresAt: expires.toISOString() }, new Date("2026-11-20T00:00:00Z")), false);
});

// ─── Buttons ─────────────────────────────────────────────────────────────────

test("buttons: each role's own; add to my shop needs the supplier's product", () => {
  assert.equal(s.ctaProblem("supplier", "add_product", true), null);
  assert.match(s.ctaProblem("supplier", "add_product", false), /product/);
  assert.match(s.ctaProblem("seller", "add_product", true), /isn't available/);
  assert.equal(s.ctaProblem("logistics_partner", "connect", false), null);
  assert.equal(s.ctaProblem("logistics_partner", "see_rates", false), null);
  assert.match(s.ctaProblem("supplier", "connect", false), /isn't available/);
  assert.equal(s.ctaProblem("seller", "offer_delivery", false), null);
  assert.equal(s.ctaProblem("seller", "view_shop", false), null);
  assert.equal(s.ctaProblem("seller", null, false), null);
  for (const role of s.STATUS_ROLES) assert.ok(s.CTA_BY_ROLE[role].includes("chat"), role);
  for (const kind of s.STATUS_CTA_KINDS) assert.ok(s.CTA_LABELS[kind], kind);
  assert.equal(s.CTA_LABELS.add_product, "Add to my shop");
});

// ─── Plain text ──────────────────────────────────────────────────────────────

test("text: tags, control and invisible characters removed, spaces collapsed, lengths capped", () => {
  assert.equal(s.plainLine("  <b>New</b>   totes\n in stock "), "New totes in stock");
  assert.equal(s.plainLine('<img src=x onerror="alert(1)">Hi'), "Hi");
  assert.equal(s.plainLine("<script>alert(1)</script>"), "alert(1)", "the markup goes; what's left is shown as text");
  assert.equal(s.plainLine("a\u0000b​c‮d"), "abcd");
  assert.equal(s.plainLine("x".repeat(200)).length, s.STATUS_HEADLINE_MAX);
  assert.equal(s.plainLine("😀".repeat(100)), "😀".repeat(80), "counted in characters, never splitting an emoji");
  assert.equal(s.plainText("Line one\r\n\r\n\r\n\r\nLine   two\t!"), "Line one\n\nLine two !");
  assert.equal(s.plainText("y".repeat(1000)).length, s.STATUS_CAPTION_MAX);
  assert.equal(s.plainLine(null), "");
  assert.equal(s.plainText("   "), "");
});

// ─── Photos ──────────────────────────────────────────────────────────────────

test("photos: only this user's uploads in our bucket; paths unguessable with the checked type's extension", () => {
  const opts = { supabaseUrl: "https://abc.supabase.co", bucket: "shopinbos-media", userId: "user1" };
  const url = "https://abc.supabase.co/storage/v1/object/public/shopinbos-media/status/user1/1700000000-abcdef0123456789.jpg";
  assert.equal(s.isStatusImageUrl(url, opts), true);
  assert.equal(s.isStatusImageUrl(url.replace("user1", "user2"), opts), false, "someone else's photo");
  assert.equal(s.isStatusImageUrl(url.replace("https", "http"), opts), false);
  assert.equal(s.isStatusImageUrl(url.replace("abc.supabase.co", "evil.example"), opts), false);
  assert.equal(s.isStatusImageUrl(url.replace("/status/", "/products/"), opts), false);
  assert.equal(s.isStatusImageUrl(url + "?x=1", opts), false);
  assert.equal(s.isStatusImageUrl(url.replace(".jpg", ".html"), opts), false);
  assert.equal(s.isStatusImageUrl("https://abc.supabase.co/storage/v1/object/public/shopinbos-media/status/user1/../user2/a.jpg", opts), false);
  assert.equal(s.isStatusImageUrl("not a url", opts), false);
  assert.equal(s.isStatusImageUrl(url, { ...opts, supabaseUrl: undefined }), false);
  const local = { ...opts, supabaseUrl: "http://127.0.0.1:54321" };
  assert.equal(s.isStatusImageUrl("http://127.0.0.1:54321/storage/v1/object/public/shopinbos-media/status/user1/1-abcdef0123.png", local), true);
  assert.equal(s.statusImagePath("user1", "image/webp", "abcdef0123456789", 5), "status/user1/5-abcdef0123456789.webp");
  assert.throws(() => s.statusImagePath("user1", "text/html", "abcdef0123456789"));
  assert.throws(() => s.statusImagePath("../x", "image/png", "abcdef0123456789"));
  assert.equal(s.isStatusImageType("image/heic"), true);
  assert.equal(s.isStatusImageType("image/svg+xml"), false);
  assert.equal(s.STATUS_IMAGE_MAX_BYTES, 8 * 1024 * 1024);
});

// ─── Supplier tracking ───────────────────────────────────────────────────────

test("tracking: done steps, then one 'now', then todo; stopped orders have no 'now'", () => {
  const steps = [
    { label: "A", done: true, at: "2026-11-18T10:00:00.000Z" },
    { label: "B", done: false, at: null },
    { label: "C", done: false, at: null },
  ];
  assert.deepEqual(t.trackSteps(steps).map((step) => step.state), ["done", "now", "todo"]);
  assert.deepEqual(t.trackSteps(steps, true).map((step) => step.state), ["done", "todo", "todo"]);
  const accepted = t.dropshipSteps({ status: "accepted", createdAt: "2026-11-18T10:00:00Z", acceptedAt: "2026-11-18T11:00:00Z", packedAt: null });
  assert.deepEqual(t.trackSteps(accepted).map((step) => `${step.label}:${step.state}`), ["Order placed:done", "Accepted:done", "Packed:now", "On the way:todo", "Delivered:todo"]);
  const shipped = t.wholesaleSteps({ status: "shipped", createdAt: "2026-11-18T10:00:00Z" });
  assert.deepEqual(t.trackSteps(shipped).map((step) => step.state), ["done", "done", "done", "done", "now"]);
  assert.equal(t.trackTitle("pending", null), "Waiting for you to accept");
  assert.equal(t.trackTitle("accepted", "picked_up"), "Picked up");
  assert.equal(t.trackTitle("accepted", null, true), "Packed, waiting for pickup");
  assert.equal(t.trackTitle("delivered", "in_transit"), "Delivered");
  assert.equal(t.trackTitle("rejected", "pending"), "You declined this order");
});

// ─── Source checks ───────────────────────────────────────────────────────────

test("routes: Bearer auth for the three business roles, zod, plain text, rate limit, expiry on read", () => {
  const shared = read("src/app/api/mobile/status/_shared.ts");
  assert.match(shared, /withAuth\(handler, \["seller", "supplier", "logistics_partner"\]\)/);
  const main = read("src/app/api/mobile/status/route.ts");
  assert.match(main, /z\.object\(/);
  assert.match(main, /plainLine\(input\.headline, STATUS_HEADLINE_MAX\)/);
  assert.match(main, /plainText\(input\.caption/);
  assert.match(main, /checkRateLimitShared\(rateLimitKey\("status-post", user\.id\), \{ maxRequests: STATUS_POSTS_PER_DAY, windowMs: 24 \* 60 \* 60_000 \}\)/);
  assert.match(main, /isStatusImageUrl\(imageUrl/);
  assert.match(main, /supplier: \{ userId: user\.id \}/, "a supplier's own product");
  assert.match(main, /userId: user\.id \}/);
  assert.match(main, /rewardStatusPosted\(user\.id, row\.id\)/);
  assert.match(main, /created\(\{ post, reward \}\)/);
  const server = read("src/lib/status/status.server.ts");
  assert.match(server, /expiresAt: \{ gt: now \}/, "expired posts are never read");
  assert.match(server, /authorId: \{ not: viewer\.id \}/, "never my own in the feed");
  assert.match(server, /db\.deliveryConnection\.findMany/);
  assert.match(server, /supplierProductId: \{ not: null \}/);
  assert.match(server, /rankFeed\(candidates, viewer\.id\)/);
  for (const file of ["src/app/api/mobile/status/[id]/view/route.ts", "src/app/api/mobile/status/[id]/like/route.ts"]) {
    const source = read(file);
    assert.match(source, /livePost\(id\)/, file);
    assert.match(source, /viewerCanSee\(/, file);
    assert.match(source, /skipDuplicates: true|deleteMany/, file);
  }
  assert.match(read("src/app/api/mobile/status/[id]/route.ts"), /where: \{ id, authorId: user\.id \}/, "own posts only");
  const upload = read("src/app/api/mobile/status/upload/route.ts");
  assert.match(upload, /assertUploadContent\(file\)/);
  assert.match(upload, /STATUS_IMAGE_MAX_BYTES/);
  assert.match(upload, /uploadPublicFileAt\(path, file\)/);
});

test("purge cron: CRON_SECRET (constant time) or QStash, scheduled, deletes expired posts and photos", () => {
  const cron = read("src/app/api/cron/status-purge/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\s*if \(denied\) return denied;/);
  assert.match(read("src/lib/auth/cron-request.ts"), /cronAuthorization/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "status-purge", path: "\/api\/cron\/status-purge", cron: "41 \* \* \* \*" \}/);
  const server = read("src/lib/status/status.server.ts");
  assert.match(server, /expiresAt: \{ lte: before \}/);
  assert.match(server, /removeFileByPublicUrl/);
});

test("reward hook: lazy, optional, never throws", () => {
  const hook = read("src/lib/status/reward-hook.server.ts");
  assert.match(hook, /await import\(/);
  assert.match(hook, /rewards\.server\.ts/);
  assert.match(hook, /kind: "status_posted", ref: postId/);
  assert.match(hook, /catch \{\s*return null;/);
});

test("supplier tracking: own orders only, the shared timeline, storefront order page for dropship, no rider location", () => {
  const source = read("src/app/api/mobile/supplier/orders/[id]/track/route.ts");
  assert.match(source, /withSupplier/);
  assert.match(source, /supplierId: supplier\.id/);
  assert.match(source, /deliveryTimeline\(/);
  assert.match(source, /buildStorefrontUrl\(order\.retailOrder\.store, `\/order\/\$\{order\.retailOrder\.id\}`\)/);
  assert.match(source, /shareUrl: null/);
  assert.doesNotMatch(source, /riderLocation|lastLat|lastLng|RiderLocationPoint|["'`]\/t\//);
});

test("schema and migration: three models, additive and safe to re-run", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /Status \(24-hour stories\)/);
  for (const model of ["StatusPost", "StatusView", "StatusLike"]) assert.match(schema, new RegExp(`model ${model} \\{`), model);
  assert.match(schema, /@@unique\(\[postId, viewerId\]\)/);
  assert.match(schema, /@@unique\(\[postId, userId\]\)/);
  const path = "docs/migrations/2026-11-18-status-posts.sql";
  assert.ok(existsSync(new URL(`../${path}`, import.meta.url)));
  const sql = read(path);
  for (const table of ["StatusPost", "StatusView", "StatusLike"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), table);
  assert.doesNotMatch(sql, /DROP |CREATE TABLE "|CREATE INDEX "|CREATE UNIQUE INDEX "/);
});
