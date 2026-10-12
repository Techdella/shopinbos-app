// Follow-ups: the shared (Postgres) rate limiter, the private key on product feeds, and which product news
// failures "Retry N failed" may resend.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const core = await import("../src/lib/rate-limit-core.ts");
const feeds = await import("../src/lib/social/feeds.ts");
const catalog = await import("../src/lib/whatsapp-catalog/pure.ts");
const newsRun = await import("../src/lib/email/product-news-run.ts");

// ─── Rate limiter: window math ──────────────────────────────────────────────────

test("limiter: fixed windows are epoch-aligned, rows live two windows, sliding estimate weights the previous one", () => {
  const minute = 60_000;
  assert.equal(core.windowStartFor(0, minute), 0);
  assert.equal(core.windowStartFor(minute - 1, minute), 0);
  assert.equal(core.windowStartFor(minute, minute), minute);
  assert.equal(core.windowStartFor(10 * minute + 12_345, minute), 10 * minute, "every instance agrees on the window");
  assert.equal(core.bucketExpiresAt(10 * minute, minute), 12 * minute);

  // A quarter into the window: 75% of the previous window still overlaps the last minute.
  assert.equal(core.slidingCount(2, 8, 10 * minute + 15_000, 10 * minute, minute), 2 + 8 * 0.75);
  assert.equal(core.slidingCount(5, 100, 11 * minute - 1, 10 * minute, minute) < 5.01, true, "the previous window fades out");
  assert.equal(core.slidingCount(5, 100, 10 * minute, 10 * minute, minute), 105);

  const config = { maxRequests: 10, windowMs: minute };
  const start = 10 * minute;
  assert.deepEqual(core.decide(10, 0, start + 1, config), { allowed: true, remaining: 0, resetAt: start + minute });
  assert.equal(core.decide(11, 0, start + 1, config).allowed, false);
  // 6 now + 10 last window, halfway through: 6 + 5 = 11 > 10, refused; plain fixed windows would allow it.
  assert.equal(core.decide(6, 10, start + minute / 2, config).allowed, false);
  assert.equal(core.decide(6, 10, start + minute / 2, { ...config, sliding: false }).allowed, true);
});

test("limiter: keys keep a readable scope and hash the identifying parts", () => {
  const a = core.rateLimitKey("public:checkout", "203.0.113.9");
  assert.match(a, /^public:checkout:[A-Za-z0-9_-]{32}$/);
  assert.equal(a, core.rateLimitKey("public:checkout", "203.0.113.9"), "stable across instances");
  assert.notEqual(a, core.rateLimitKey("public:checkout", "203.0.113.10"));
  assert.notEqual(a, core.rateLimitKey("public:orderLookup", "203.0.113.9"), "scopes don't share counts");
  assert.ok(!a.includes("203.0.113.9"), "no raw IPs in the table");
  assert.notEqual(core.rateLimitKey("x", "a:b"), core.rateLimitKey("x", "a", "b"), "parts can't run into each other");
  assert.ok(!core.rateLimitKey("support-request:contact", "ada@example.com").includes("ada"));
});

// ─── Rate limiter: shared check with a fake bucket table ────────────────────────

function fakeDeps({ fail = null, now = 1_000_000_000_000 } = {}) {
  const table = new Map();
  const memory = new Map();
  const calls = { bump: 0, sweep: 0, warn: [] };
  return {
    table,
    calls,
    deps: {
      now: () => now,
      random: () => 0.5,
      warn: (message) => calls.warn.push(message),
      memory(key, config) {
        const entry = memory.get(key) ?? { count: 0 };
        entry.count += 1;
        memory.set(key, entry);
        return { allowed: entry.count <= config.maxRequests, remaining: Math.max(0, config.maxRequests - entry.count), resetAt: now + config.windowMs };
      },
      async bump({ key, windowStart, previousStart }) {
        calls.bump += 1;
        if (fail) throw fail;
        const k = `${key}@${windowStart.getTime()}`;
        table.set(k, (table.get(k) ?? 0) + 1);
        return { current: table.get(k), previous: table.get(`${key}@${previousStart.getTime()}`) ?? 0 };
      },
      async sweep() {
        calls.sweep += 1;
      },
    },
  };
}

test("limiter: two instances (separate memory) share one count, so the combined total trips the limit", async () => {
  const shared = fakeDeps();
  const other = fakeDeps();
  // Instance B: its own memory, the same table.
  other.deps.bump = shared.deps.bump;
  const config = { maxRequests: 4, windowMs: 60_000 };
  const answers = [];
  for (let i = 0; i < 6; i++) answers.push((await core.checkShared(i % 2 ? other.deps : shared.deps, "public:checkout:k", config)).allowed);
  assert.deepEqual(answers, [true, true, true, true, false, false]);
});

test("limiter: the memory gate refuses floods without asking the database", async () => {
  const { deps, calls } = fakeDeps();
  const config = { maxRequests: 2, windowMs: 60_000 };
  for (let i = 0; i < 5; i++) await core.checkShared(deps, "k", config);
  assert.equal(calls.bump, 2, "only requests the local gate allowed reached the database");
  const last = await core.checkShared(deps, "k", config);
  assert.equal(last.source, "memory");
  assert.equal(last.allowed, false);
});

test("limiter: a database error fails open with a warning, or closed for failClosed limits", async () => {
  const boom = Object.assign(new Error("connection terminated"), { code: "ECONNRESET" });
  const open = fakeDeps({ fail: boom });
  const result = await core.checkShared(open.deps, "auth:login:ip:x", { maxRequests: 5, windowMs: 60_000 });
  assert.deepEqual([result.allowed, result.source], [true, "fail-open"]);
  assert.match(open.calls.warn[0], /fail open/);

  const closed = fakeDeps({ fail: boom });
  const refused = await core.checkShared(closed.deps, "auth:login:ip:x", { maxRequests: 5, windowMs: 60_000, failClosed: true });
  assert.deepEqual([refused.allowed, refused.source], [false, "fail-closed"]);
  assert.match(closed.calls.warn[0], /fail closed/);
  assert.equal(refused.resetAt, 1_000_000_000_000 + 60_000, "try again in a minute, not at the end of the window");

  // Before the migration runs (table missing) even failClosed limits use the memory count rather than locking
  // everyone out of sign-in.
  const missing = fakeDeps({ fail: Object.assign(new Error('relation "RateLimitBucket" does not exist'), { meta: { code: "42P01" } }) });
  assert.equal(core.isMissingTable(Object.assign(new Error("x"), { cause: { originalCode: "42P01" } })), true);
  assert.equal(core.isMissingTable(boom), false);
  const fallback = await core.checkShared(missing.deps, "auth:login:ip:x", { maxRequests: 5, windowMs: 60_000, failClosed: true });
  assert.deepEqual([fallback.allowed, fallback.source], [true, "fail-open"]);
});

test("limiter: expired rows are swept on about 1% of checks", async () => {
  const { deps, calls } = fakeDeps();
  deps.random = () => 0.5;
  await core.checkShared(deps, "k", { maxRequests: 9, windowMs: 1000 });
  assert.equal(calls.sweep, 0);
  deps.random = () => 0.001;
  await core.checkShared(deps, "k", { maxRequests: 9, windowMs: 1000 });
  assert.equal(calls.sweep, 1);
  assert.equal(core.SWEEP_CHANCE, 0.01);
});

test("limiter: the server uses one parameterized upsert, a ctid-limited sweep, and the migration matches", () => {
  const source = read("src/lib/rate-limit.ts");
  assert.match(source, /db\.\$queryRaw<BumpRow\[\]>`\s*INSERT INTO "RateLimitBucket" \("key", "windowStart", "count", "expiresAt"\)\s*VALUES \(\$\{bucketKey\}, \$\{windowStart\}, 1, \$\{expiresAt\}\)\s*ON CONFLICT \("key", "windowStart"\) DO UPDATE SET "count" = "RateLimitBucket"\."count" \+ 1/);
  assert.doesNotMatch(source, /\$queryRawUnsafe|\$executeRawUnsafe/);
  assert.match(source, /DELETE FROM "RateLimitBucket" WHERE ctid IN \(\s*SELECT ctid FROM "RateLimitBucket" WHERE "expiresAt" < \$\{now\} LIMIT 500/);

  const sql = read("docs/migrations/2026-10-17-followups.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "RateLimitBucket"/);
  assert.match(sql, /PRIMARY KEY \("key", "windowStart"\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"\("expiresAt"\)/);
  assert.match(sql, /ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DROP|TRUNCATE|DELETE/);
  assert.match(read("prisma/schema.prisma"), /model RateLimitBucket \{[\s\S]*@@id\(\[key, windowStart\]\)[\s\S]*@@index\(\[expiresAt\]\)/);
});

test("limiter: security-relevant call sites use the shared limiter", () => {
  assert.match(read("src/lib/auth/throttle.ts"), /checkRateLimitShared\(`auth:\$\{key\}`, \{[^}]*failClosed: true/);
  const limits = read("src/lib/rate-limit.ts");
  for (const action of ["checkout", "orderLookup", "form", "abandonedCart", "wishlist"]) assert.match(limits, new RegExp(`\\n  ${action}: \\{`), action);
  assert.match(limits, /orderLookup: \{ failClosed: true \}/);
  assert.match(read("src/app/api/public/store/[slug]/abandoned-cart/route.ts"), /await overPublicLimit\(req\.headers, "abandonedCart"\)/);
  assert.match(read("src/app/api/support/requests/route.ts"), /checkRateLimitShared\(rateLimitKey\("support-request:ip", ip\)/);
  assert.match(read("src/app/api/support/tickets/route.ts"), /checkRateLimitShared\(rateLimitKey\("support-ticket"/);
  assert.match(read("src/lib/ai/usage.ts"), /checkRateLimitShared\(rateLimitKey\(`ai:\$\{kind\}`/);
  assert.match(read("src/lib/kyb/verify-cac.server.ts"), /checkRateLimitShared\(rateLimitKey\("kyb-cac"/);
  const domains = read("src/lib/domains/ownership.server.ts");
  assert.match(domains, /checkRateLimitShared\(rateLimitKey\("domain-verify"/);
  assert.match(domains, /checkRateLimitShared\(rateLimitKey\("domain-claim"/);
  assert.match(read("src/app/rider/[token]/actions.ts"), /rateLimitKey\("rider:code", jobId\), \{[^}]*failClosed: true/);
});

// ─── Feed key ───────────────────────────────────────────────────────────────────

test("feeds: the old channel feeds need the store's feed key; wrong or missing answers like an unknown store", () => {
  const key = catalog.generateFeedToken();
  assert.equal(catalog.feedTokenMatches(key, key), true);
  assert.equal(catalog.feedTokenMatches(null, key), false);
  assert.equal(catalog.feedTokenMatches("", key), false);
  assert.equal(catalog.feedTokenMatches(catalog.generateFeedToken(), key), false);
  assert.equal(catalog.feedTokenMatches(key.slice(0, -1), key), false);
  assert.equal(catalog.feedTokenMatches(key, null), false, "a store without a key has no feed");

  assert.equal(feeds.legacyFeedPath("ada shop", "google.xml", key), `/api/public/feeds/ada%20shop/google.xml?token=${key}`);
  assert.equal(feeds.FEED_KEY_NOTICE, "Feed links now include a private key. Update the link in Commerce Manager.");

  const route = read("src/app/api/public/feeds/[store]/[file]/route.ts");
  assert.match(route, /if \(!store \|\| store\.status !== "active"\) return notFound\(\);/);
  assert.match(route, /if \(!key \|\| !feedTokenMatches\(token, key\.feedToken\)\) return notFound\(\);/);
  // The WhatsApp redirect comes after the key check, never before.
  assert.ok(route.indexOf("feedTokenMatches(token") < route.indexOf('parsed.channel === "whatsapp"'));
  assert.match(route, /status: 307/);
  assert.match(route, /Location: catalogFeedPath\(store\.slug, key\.feedToken\)/);

  const page = read("src/app/channels/page.tsx");
  assert.match(page, /FEED_KEY_NOTICE/);
  assert.match(page, /channel === "whatsapp" \? catalogFeedUrl\(store\.slug, feedKey\) : feedUrl\(store\.slug, file, feedKey\)/);
  assert.match(read("src/app/home/inbox/whatsapp-catalog/WhatsAppCatalogClient.tsx"), /FEED_KEY_NOTICE/);
  assert.doesNotMatch(read("src/lib/ai/peggy/social-tools.ts"), /feedUrl\(/, "Peggy doesn't paste private feed links into the chat");
});

// ─── Product news: what "Retry N failed" may resend ─────────────────────────────

/** Evaluates the Prisma filter retryableNewsWhere returns against plain rows (the subset of operators it uses). */
function matches(where, row) {
  return Object.entries(where).every(([field, cond]) => {
    if (field === "OR") return cond.some((c) => matches(c, row));
    if (field === "AND") return cond.every((c) => matches(c, row));
    if (field === "NOT") return !matches(cond, row);
    const value = row[field];
    if (cond === null) return value === null;
    if (typeof cond === "object" && "in" in cond) return cond.in.includes(value);
    if (typeof cond === "object" && "startsWith" in cond) return value !== null && String(value).startsWith(cond.startsWith);
    return value === cond;
  });
}

test("product news: the retry filter and retryableCount follow one rule (refused yes, delivery unknown never)", () => {
  const errors = [null, "Domain not verified", "Invalid to address", newsRun.NEWS_INTERRUPTED, `${newsRun.NEWS_UNKNOWN_PREFIX}timed out`, `${newsRun.NEWS_UNKNOWN_PREFIX}no answer`];
  const rows = errors.map((error, i) => ({ id: `r${i}`, broadcastId: "b1", status: "failed", error }));
  rows.push({ id: "sent", broadcastId: "b1", status: "sent", error: null }, { id: "other", broadcastId: "b2", status: "failed", error: "Refused" });

  const where = newsRun.retryableNewsWhere("b1");
  for (const row of rows.filter((r) => r.broadcastId === "b1" && r.status === "failed")) {
    assert.equal(matches(where, row), newsRun.isRetryableNewsFailure(row.error), String(row.error));
  }
  const retryable = rows.filter((row) => matches(where, row)).map((row) => row.id);
  assert.deepEqual(retryable, ["r0", "r1", "r2"]);
  assert.deepEqual(rows.filter((row) => matches(newsRun.retryableNewsWhere({ in: ["b1", "b2"] }), row)).map((r) => r.id), ["r0", "r1", "r2", "other"]);

  assert.deepEqual(newsRun.newsRetrySummary(6, 3), { retryableCount: 3, unconfirmedCount: 3 });
  assert.deepEqual(newsRun.newsRetrySummary(3, 0), { retryableCount: 0, unconfirmedCount: 3 }, "button hidden, note shown");
  assert.deepEqual(newsRun.newsRetrySummary(0, 0), { retryableCount: 0, unconfirmedCount: 0 });
  assert.deepEqual(newsRun.newsRetrySummary(2, 5), { retryableCount: 2, unconfirmedCount: 0 }, "never more than failed");

  const ui = read("src/components/admin/ProductNewsManager.tsx");
  assert.match(ui, /row\.retryableCount > 0 && row\.status !== "draft" \? <PillButton[^\n]*?>Retry \{n\(row\.retryableCount\)\} failed<\/PillButton>/);
  assert.match(ui, /couldn&apos;t be confirmed and won&apos;t be resent to avoid duplicates/);
  for (const route of ["src/app/api/admin/product-news/route.ts"]) assert.match(read(route), /withRetryCounts\(/);
  for (const route of ["[id]/route.ts", "[id]/retry/route.ts", "[id]/send/route.ts"]) assert.match(read(`src/app/api/admin/product-news/${route}`), /loadBroadcast\(/);
});
