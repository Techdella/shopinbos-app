// Email provider refusals and retries (weekly summaries and product news) driven with a failing sender and
// in-memory stores that keep the same rules as the Prisma ones; product news image upload rules; dark mode for
// pasted full-HTML templates.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const outcome = await import("../src/lib/email/batch-outcome.ts");
const weeklyRun = await import("../src/lib/email/weekly-summary-run.ts");
const newsRun = await import("../src/lib/email/product-news-run.ts");
const newsImage = await import("../src/lib/email/news-image.ts");
const news = await import("../src/lib/email/product-news.ts");
const layout = await import("../src/lib/marketing/email-layout.ts");
const preview = await import("../src/lib/marketing/preview.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const count = (text, re) => (text.match(re) ?? []).length;

// ─── A scripted email provider ─────────────────────────────────────────────────
// Each call takes the next scripted answer (then "ok" forever). It records what was accepted, so a test can check
// that nobody ever got two copies. An "unknown" answer counts as delivered: the worst case for duplicates.

const OK = { success: true, ids: [] };
const REFUSED = { success: false, statusCode: 429, message: "daily_quota_exceeded" };
const NO_ANSWER = { success: false, statusCode: null, message: "Unable to fetch data. The request could not be resolved." };

function provider(script = []) {
  const answers = [...script];
  const calls = [];
  const delivered = new Map();
  const deliver = (to) => delivered.set(to, (delivered.get(to) ?? 0) + 1);
  const send = async (emails) => {
    const answer = answers.length ? answers.shift() : OK;
    calls.push({ to: emails.map((e) => e.to), answer: typeof answer === "function" ? "custom" : answer });
    if (answer === "throw") {
      emails.forEach((e) => deliver(e.to));
      throw new Error("socket hang up");
    }
    const result = typeof answer === "function" ? answer(emails) : answer;
    if (result.success) emails.forEach((e, i) => !(result.errors ?? []).some((x) => x.index === i) && deliver(e.to));
    else if (result.statusCode === null) emails.forEach((e) => deliver(e.to));
    return result;
  };
  return { send, calls, delivered, maxCopies: () => Math.max(0, ...delivered.values()) };
}

// ─── batchOutcome ──────────────────────────────────────────────────────────────

test("batchOutcome: sent, refused (any provider error), partial (per-email errors), unknown (no answer)", () => {
  assert.deepEqual(outcome.batchOutcome(OK, 3), { kind: "sent", sent: [0, 1, 2] });
  assert.deepEqual(outcome.batchOutcome(REFUSED, 3), { kind: "refused", message: "daily_quota_exceeded" });
  assert.equal(outcome.batchOutcome({ success: false, statusCode: 500, message: "boom" }, 2).kind, "refused");
  assert.equal(outcome.batchOutcome({ success: false, message: "Resend API key not configured" }, 2).kind, "refused", "nothing was sent");
  assert.deepEqual(outcome.batchOutcome(NO_ANSWER, 2), { kind: "unknown", message: NO_ANSWER.message });
  assert.equal(outcome.batchOutcome(null, 2).kind, "unknown");
  assert.deepEqual(outcome.batchOutcome({ success: true, errors: [{ index: 1, message: "Invalid `to`" }, { index: 9, message: "out of range" }] }, 3), {
    kind: "partial",
    sent: [0, 2],
    refused: [{ index: 1, message: "Invalid `to`" }],
  });
  assert.equal(outcome.batchOutcome({ success: true, errors: [{ index: 0, message: "a" }, { index: 1, message: "a" }] }, 2).kind, "refused", "every email refused = the batch was refused");
});

test("sendSafely: a thrown send is 'unknown' (the request may have gone out), never 'refused'", async () => {
  const r = await outcome.sendSafely(async () => {
    throw new Error("socket hang up");
  }, [{}]);
  assert.equal(r.kind, "unknown");
  assert.match(r.message, /socket hang up/);
});

// ─── Weekly summaries ─────────────────────────────────────────────────────────

const WEEK = "2026-10-05";

/** Same rules as the Prisma store in weekly-summary.server.ts. */
function weeklyStore(users, options = {}) {
  const rows = new Map(); // userId → { status, attempts, kind, error, sentAt }
  const optedOut = new Set(options.optedOut ?? []);
  const quiet = new Set(options.quiet ?? []);
  const nothing = new Set(options.nothing ?? []);
  const byId = (id) => users.find((u) => u.id === id);
  const onlyClaimed = (ids, patch) => ids.forEach((id) => rows.get(id)?.status === "claimed" && Object.assign(rows.get(id), patch));
  const store = {
    rows,
    optedOut,
    async reclaimFailed(weekStart, take, max) {
      assert.equal(weekStart, WEEK);
      const failed = [...rows].filter(([, r]) => r.status === "failed" && r.attempts < max).sort(([a], [b]) => a.localeCompare(b)).slice(0, take);
      const out = [];
      for (const [id, row] of failed) {
        Object.assign(row, { status: "claimed", attempts: row.attempts + 1, error: null });
        if (optedOut.has(id)) Object.assign(row, { status: "skipped", kind: "none", error: "Turned off weekly summaries or has no email" });
        else out.push(byId(id));
      }
      return out;
    },
    async nextCandidates(take) {
      return users.filter((u) => !rows.has(u.id) && !optedOut.has(u.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take);
    },
    async claim(weekStart, list) {
      const won = new Set();
      for (const u of list) if (!rows.has(u.id)) (rows.set(u.id, { status: "claimed", attempts: 1, kind: "full", error: null, sentAt: null }), won.add(u.id));
      return won;
    },
    async lastQuiet() {
      return new Map();
    },
    async compose(user) {
      if (nothing.has(user.id)) return null;
      return { kind: quiet.has(user.id) ? "quiet" : "full", email: { to: user.email, subject: "Your week" } };
    },
    async markSkipped(_w, id) {
      onlyClaimed([id], { status: "skipped", kind: "none" });
    },
    async markSent(_w, ids, kind, at) {
      onlyClaimed(ids, { status: "sent", kind, sentAt: at, error: null });
    },
    async markFailed(_w, ids, error) {
      onlyClaimed(ids, { status: "failed", error });
    },
    async markUnknown(_w, ids, error) {
      onlyClaimed(ids, { status: "unknown", error });
    },
  };
  return store;
}

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `u${String(i + 1).padStart(2, "0")}`, email: `u${i + 1}@example.com`, name: `User ${i + 1}`, role: "seller" }));
const weekly = (store, p, extra = {}) => weeklyRun.runWeeklyBatches({ weekStart: WEEK, store, send: p.send, maxPerRun: 300, deadline: Date.now() + 60_000, ...extra });
const statuses = (store) => Object.fromEntries([...store.rows].map(([id, r]) => [id, `${r.status}/${r.attempts}`]));

test("weekly: refused on the 1st and 2nd attempts, sent on the 3rd; one copy each, never again after", async () => {
  const users = people(4);
  const store = weeklyStore(users);
  const p = provider([REFUSED, REFUSED]);

  const r1 = await weekly(store, p);
  assert.deepEqual({ claimed: r1.claimed, sent: r1.sent, failed: r1.failed }, { claimed: 4, sent: 0, failed: 4 });
  assert.deepEqual(statuses(store), { u01: "failed/1", u02: "failed/1", u03: "failed/1", u04: "failed/1" });
  assert.match(r1.errors[0], /quota/);

  const r2 = await weekly(store, p);
  assert.deepEqual({ claimed: r2.claimed, sent: r2.sent, failed: r2.failed }, { claimed: 4, sent: 0, failed: 4 });
  assert.deepEqual(statuses(store), { u01: "failed/2", u02: "failed/2", u03: "failed/2", u04: "failed/2" });

  const r3 = await weekly(store, p);
  assert.deepEqual({ claimed: r3.claimed, sent: r3.sent, failed: r3.failed }, { claimed: 4, sent: 4, failed: 0 });
  assert.deepEqual(statuses(store), { u01: "sent/3", u02: "sent/3", u03: "sent/3", u04: "sent/3" });

  const r4 = await weekly(store, p);
  assert.equal(r4.claimed, 0);
  assert.equal(p.calls.length, 3, "nothing left to send");
  assert.equal(p.delivered.size, 4);
  assert.equal(p.maxCopies(), 1, "nobody got two copies");
});

test("weekly: refused 3 times is marked failed for good and not retried again", async () => {
  const store = weeklyStore(people(3));
  const p = provider([REFUSED, REFUSED, REFUSED]);
  for (let i = 0; i < 3; i++) await weekly(store, p);
  assert.deepEqual(statuses(store), { u01: "failed/3", u02: "failed/3", u03: "failed/3" });
  const r4 = await weekly(store, p);
  const r5 = await weekly(store, p);
  assert.equal(r4.claimed + r5.claimed, 0);
  assert.equal(p.calls.length, 3, "no 4th attempt");
  assert.equal(p.delivered.size, 0);
  assert.equal([...store.rows.values()][0].error, "daily_quota_exceeded", "the provider's reason is kept");
});

test("weekly: a partial batch marks only the refused emails failed, and the next run retries just those", async () => {
  const store = weeklyStore(people(5), { quiet: ["u03"] });
  const p = provider([{ success: true, ids: ["a", "b", "c", "d"], errors: [{ index: 1, message: "Invalid `to` field" }] }]);
  const r1 = await weekly(store, p);
  assert.deepEqual({ sent: r1.sent, quiet: r1.quiet, failed: r1.failed }, { sent: 3, quiet: 1, failed: 1 });
  assert.deepEqual(statuses(store), { u01: "sent/1", u02: "failed/1", u03: "sent/1", u04: "sent/1", u05: "sent/1" });
  assert.equal(store.rows.get("u03").kind, "quiet");
  assert.match(store.rows.get("u02").error, /Invalid `to`/);

  const r2 = await weekly(store, p);
  assert.deepEqual(p.calls[1].to, ["u2@example.com"], "only the refused one is sent again");
  assert.equal(r2.sent, 1);
  assert.equal(statuses(store).u02, "sent/2");
  assert.equal(p.maxCopies(), 1);
});

test("weekly: no answer from the provider (network error or a throw) is 'unknown' and never retried", async () => {
  for (const answer of [NO_ANSWER, "throw"]) {
    const store = weeklyStore(people(2));
    const p = provider([answer]);
    const r1 = await weekly(store, p);
    assert.equal(r1.unknown, 2);
    assert.deepEqual(statuses(store), { u01: "unknown/1", u02: "unknown/1" });
    await weekly(store, p);
    await weekly(store, p);
    assert.equal(p.calls.length, 1, "they may have gone out: no second try");
    assert.equal(p.maxCopies(), 1);
  }
});

test("weekly: a refusal stops the run; the next run retries the refused batch first, then carries on with new users", async () => {
  const store = weeklyStore(people(6));
  const p = provider([OK, REFUSED]);
  const r1 = await weekly(store, p, { batchSize: 2 });
  assert.deepEqual({ claimed: r1.claimed, sent: r1.sent, failed: r1.failed }, { claimed: 4, sent: 2, failed: 2 });
  assert.equal(store.rows.has("u05"), false, "stopped after the refusal");
  await weekly(store, p, { batchSize: 2 });
  assert.deepEqual(p.calls.map((c) => c.to), [
    ["u1@example.com", "u2@example.com"],
    ["u3@example.com", "u4@example.com"],
    ["u3@example.com", "u4@example.com"],
    ["u5@example.com", "u6@example.com"],
  ]);
  assert.ok([...store.rows.values()].every((r) => r.status === "sent"));
  assert.equal(p.maxCopies(), 1);
});

test("weekly: someone who turns summaries off after a refusal is skipped, not retried; quiet weeks with nothing are skipped", async () => {
  const store = weeklyStore(people(3), { nothing: ["u03"] });
  const p = provider([REFUSED]);
  await weekly(store, p);
  assert.equal(store.rows.get("u03").status, "skipped");
  store.optedOut.add("u02");
  await weekly(store, p);
  assert.deepEqual(p.calls[1].to, ["u1@example.com"]);
  assert.equal(store.rows.get("u02").status, "skipped");
});

test("weekly: the server uses the shared run (permissive batches) and the cron route stays behind CRON_SECRET", () => {
  const server = read("src/lib/email/weekly-summary.server.ts");
  assert.match(server, /runWeeklyBatches\(/);
  assert.match(server, /sendEmailBatch\(emails, \{ permissive: true \}\)/);
  assert.match(server, /status: "failed", attempts: \{ lt: maxAttempts \} \}, data: \{ status: "claimed", attempts: \{ increment: 1 \}/, "failed → claimed is a conditional update");
  assert.match(server, /claimed\(weekStart, userIds\), data: \{ status: "unknown"/);
  assert.match(read("src/app/api/cron/weekly-summary/route.ts"), /cronAuthorization/);
  assert.match(read("src/lib/notifications/resend.ts"), /batchValidation: "permissive"/);
});

// ─── Product news ──────────────────────────────────────────────────────────────

/** Same rules as the Prisma store in product-news.server.ts. */
function newsStore(n, options = {}) {
  const broadcast = { status: options.status ?? "sending", lastError: null, counts: null, sentAt: null };
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${String(i + 1).padStart(2, "0")}`, userId: `u${i + 1}`, email: `u${i + 1}@example.com`, role: "seller", status: "queued", error: null, updatedAt: Date.now() }));
  const optedOut = new Set(options.optedOut ?? []);
  const sending = (ids, patch) => rows.forEach((r) => ids.includes(r.id) && r.status === "sending" && Object.assign(r, patch));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    broadcast,
    rows,
    optedOut,
    async status() {
      return broadcast.status;
    },
    async hasRecipients() {
      return true;
    },
    async snapshot() {},
    async claim(_id, take) {
      const got = rows.filter((r) => r.status === "queued").slice(0, take);
      got.forEach((r) => Object.assign(r, { status: "sending", updatedAt: Date.now() }));
      return got.map(({ id, userId, email, role }) => ({ id, userId, email, role }));
    },
    async optedOut(ids) {
      return new Set(ids.filter((id) => optedOut.has(id)));
    },
    build(_id, r) {
      return { to: r.email, subject: "News" };
    },
    async markSkipped(ids) {
      sending(ids, { status: "skipped", error: "Turned off product news" });
    },
    async markSent(ids) {
      sending(ids, { status: "sent", error: null });
    },
    async markFailed(ids, error) {
      sending(ids, { status: "failed", error });
    },
    async closeStale(_id, before) {
      rows.forEach((r) => r.status === "sending" && r.updatedAt < before.getTime() && Object.assign(r, { status: "failed", error: newsRun.NEWS_INTERRUPTED }));
    },
    async refreshCounts() {
      broadcast.counts = { sent: count("sent"), failed: count("failed"), skipped: count("skipped"), queued: count("queued"), sending: count("sending") };
      return broadcast.counts;
    },
    async finish(_id, status, lastError) {
      if (broadcast.status === "sending") Object.assign(broadcast, { status, lastError, sentAt: new Date() });
    },
    async setLastError(_id, lastError) {
      broadcast.lastError = lastError;
    },
    async requeueRetryable() {
      const again = rows.filter((r) => r.status === "failed" && newsRun.isRetryableNewsFailure(r.error));
      again.forEach((r) => Object.assign(r, { status: "queued", error: null }));
      return again.length;
    },
    async resume() {
      Object.assign(broadcast, { status: "sending", lastError: null });
    },
  };
}

const process_ = (store, p, extra = {}) => newsRun.processNewsBroadcast({ id: "b1", store, send: p.send, deadline: Date.now() + 60_000, batchSize: 2, ...extra });
const retry = (store, p, extra = {}) => newsRun.retryNewsFailed({ id: "b1", store, send: p.send, deadline: Date.now() + 60_000, batchSize: 2, ...extra });
const rowStatus = (store) => store.rows.map((r) => r.status).join(",");

test("product news: a refused batch stops the run; 'Retry failed' resends only the failed recipients, once", async () => {
  const store = newsStore(5);
  const p = provider([OK, REFUSED]);
  const first = await process_(store, p);
  assert.equal(first.status, "sending", "one batch still queued");
  assert.equal(rowStatus(store), "sent,sent,failed,failed,queued");
  assert.equal(store.broadcast.lastError, "daily_quota_exceeded");

  const second = await process_(store, p); // the cron carries on with the queued row
  assert.equal(rowStatus(store), "sent,sent,failed,failed,sent");
  assert.equal(second.status, "sent", "done, with 2 failed");
  assert.deepEqual([second.sent, second.failed], [3, 2]);

  const third = await retry(store, p);
  assert.deepEqual(p.calls.at(-1).to, ["u3@example.com", "u4@example.com"], "only the refused ones");
  assert.equal(third.status, "sent");
  assert.deepEqual([third.sent, third.failed], [5, 0]);
  assert.equal(p.maxCopies(), 1);
  await assert.rejects(retry(store, p), (e) => e.code === "NOTHING_TO_RETRY" && e.status === 409);
  assert.equal(p.calls.length, 4);
});

test("product news: everything refused → 'failed'; a retry that's refused again stays failed and can be retried again", async () => {
  const store = newsStore(2);
  const p = provider([REFUSED, REFUSED]);
  assert.equal((await process_(store, p)).status, "failed");
  assert.equal(store.broadcast.status, "failed");
  assert.equal((await retry(store, p)).status, "failed");
  assert.equal(rowStatus(store), "failed,failed");
  const ok = await retry(store, p);
  assert.equal(ok.status, "sent");
  assert.equal(p.delivered.size, 2);
  assert.equal(p.maxCopies(), 1);
});

test("product news: no answer from the provider, or a crashed run, is never retried", async () => {
  const store = newsStore(4);
  const p = provider([NO_ANSWER]);
  const r = await process_(store, p);
  assert.equal(rowStatus(store), "failed,failed,queued,queued");
  assert.ok(store.rows[0].error.startsWith(newsRun.NEWS_UNKNOWN_PREFIX));
  // A run that died with rows still "sending" (older than 15 minutes) closes them as interrupted.
  await store.claim("b1", 2);
  store.rows.forEach((row) => row.status === "sending" && (row.updatedAt = Date.now() - newsRun.NEWS_STALE_MS - 1000));
  const after = await process_(store, p);
  assert.equal(after.status, "failed");
  assert.equal(store.rows[2].error, newsRun.NEWS_INTERRUPTED);
  assert.equal(r.status, "sending");
  await assert.rejects(retry(store, p), (e) => e.code === "NOTHING_TO_RETRY");
  assert.equal(p.calls.length, 1);
  assert.equal(newsRun.isRetryableNewsFailure("daily_quota_exceeded"), true);
  assert.equal(newsRun.isRetryableNewsFailure(null), true);
  assert.equal(newsRun.isRetryableNewsFailure(newsRun.NEWS_INTERRUPTED), false);
});

test("product news: a partial batch fails only the refused email; retry picks up just that one; opted-out are skipped", async () => {
  const store = newsStore(4, { optedOut: ["u4"] });
  const p = provider([{ success: true, ids: ["x"], errors: [{ index: 0, message: "Invalid `to` field" }] }]);
  const r = await process_(store, p);
  assert.equal(rowStatus(store), "failed,sent,sent,skipped");
  assert.equal(r.status, "sent");
  assert.match(store.broadcast.lastError, /Invalid/);
  await retry(store, p);
  assert.deepEqual(p.calls.at(-1).to, ["u1@example.com"]);
  assert.equal(rowStatus(store), "sent,sent,sent,skipped");
  assert.equal(p.maxCopies(), 1);
});

test("product news: retry before sending is refused; the server requeues with an explicit NULL check", async () => {
  const store = newsStore(1, { status: "draft" });
  await assert.rejects(retry(store, provider()), (e) => e.status === 409 && /hasn't been sent/.test(e.message));
  const server = read("src/lib/email/product-news.server.ts");
  // One filter (product-news-run.ts) for the requeue and the retryableCount the admin list shows.
  assert.match(read("src/lib/email/product-news-run.ts"), /OR: \[\{ error: null \}, \{ AND: \[\{ NOT: \{ error: NEWS_INTERRUPTED \} \}, \{ NOT: \{ error: \{ startsWith: NEWS_UNKNOWN_PREFIX \} \} \}\] \}\]/);
  assert.match(server, /updateMany\(\{ where: retryableNewsWhere\(id\), data: \{ status: "queued", error: null \} \}\)/);
  assert.match(server, /groupBy\(\{ by: \["broadcastId"\], where: retryableNewsWhere\(\{ in: ids \}\)/);
  assert.match(server, /FOR UPDATE SKIP LOCKED/);
});

// ─── Product news image upload ─────────────────────────────────────────────────

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const HTML = new TextEncoder().encode("<!doctype html><script>");

test("news images: JPG/PNG/WebP/GIF up to 5 MB, bytes must match, path from the checked type", () => {
  assert.equal(newsImage.newsImageProblem({ type: "image/png", size: 1000, head: PNG }), null);
  assert.match(newsImage.newsImageProblem({ type: "image/png", size: 1000, head: HTML }), /isn't the type it says/);
  assert.match(newsImage.newsImageProblem({ type: "image/svg+xml", size: 1000 }), /JPG, PNG, WebP or GIF/);
  assert.match(newsImage.newsImageProblem({ type: "text/html", size: 1000 }), /JPG, PNG, WebP or GIF/);
  assert.match(newsImage.newsImageProblem({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.equal(newsImage.newsImageProblem({ type: "image/jpeg", size: 5 * 1024 * 1024 }), null);
  assert.match(newsImage.newsImageProblem({ type: "image/gif", size: 0 }), /empty/);
  const id = "0b6f8f3e-5a0c-4c55-9a51-4b1f0c7d2e11";
  assert.equal(newsImage.newsImagePath("image/webp", id), `platform/product-news/${id}.webp`);
  assert.throws(() => newsImage.newsImagePath("image/png", "../x"));
  assert.deepEqual(newsImage.newsImageResize(2400, "image/jpeg"), { width: 1200 });
  assert.equal(newsImage.newsImageResize(800, "image/png"), null, "never enlarged");
  assert.equal(newsImage.newsImageResize(2400, "image/gif"), null, "animated GIFs kept as is");
  // The bucket (shopinbos-media) allows image/jpeg, png, webp, gif: everything we accept.
  assert.deepEqual(Object.keys(newsImage.NEWS_IMAGE_TYPES).sort(), ["image/gif", "image/jpeg", "image/png", "image/webp"]);
});

test("news images: uploaded storage URLs pass the host check; http only for a local (loopback) storage", () => {
  const prod = { storage: ["abc.supabase.co"], own: ["shopinbos.com"] };
  const url = "https://abc.supabase.co/storage/v1/object/public/shopinbos-media/platform/product-news/x.png";
  assert.equal(news.isAllowedNewsImage(url, prod), true);
  assert.equal(news.isAllowedNewsImage(url.replace("https", "http"), prod), false);
  assert.equal(news.isAllowedNewsImage("https://evil.example/x.png", prod), false);
  const local = { storage: ["127.0.0.1:54321"], own: ["shopinbos.com"], localStorageHttp: true };
  assert.equal(news.isAllowedNewsImage("http://127.0.0.1:54321/storage/v1/object/public/shopinbos-media/platform/product-news/x.png", local), true);
  assert.equal(news.isAllowedNewsImage("http://127.0.0.1:54321/somewhere/else.png", local), false);
  assert.equal(news.isAllowedNewsImage("http://shopinbos.com/x.png", local), false, "http stays off for everything else");
});

test("news images: the upload route is admin-only, validated with zod, stored server-side under platform/product-news", () => {
  const route = read("src/app/api/admin/product-news/image/route.ts");
  assert.match(route, /export const POST = withAdmin\(/);
  assert.match(route, /z\.object\(\{ file: z\.instanceof\(File/);
  assert.match(route, /apiError\(/);
  const server = read("src/lib/email/news-image.server.ts");
  assert.match(server, /uploadPublicFileAt\(path/);
  assert.match(server, /newsImageProblem\(\{ type, size: original\.byteLength, head: original\.subarray\(0, SNIFF_BYTES\) \}\)/, "sniffs the real bytes");
  assert.match(read("src/lib/email/news-image.ts"), /uploadContentProblem/, "the shared sniffing");
  const ui = read("src/components/admin/NewsImageUpload.tsx");
  for (const piece of ["onDrop", "upload.onprogress", "Remove", "Or paste an image link", 'role="progressbar"']) assert.ok(ui.includes(piece), piece);
});

// ─── Dark mode for pasted documents ────────────────────────────────────────────

const BRAND = { storeName: "Ada & Co", logoUrl: null, accent: "#FF6A2B", ink: "#111111", paper: "#F6F5F9" };
const compliance = { appUrl: "https://app.example", sender: { name: "Ada & Co", legalName: "Ada Fabrics Ltd", address: "12 Allen Avenue, Ikeja" }, kind: "marketing", reason: "you subscribed", unsubscribeUrl: "https://u", preferencesUrl: "https://p" };
const SELLER_BODY = '<body style="margin:0;background:#ffffff"><table style="background:#FFEEDD;color:#222"><tr><td style="color:#333">Sale!</td></tr></table></body>';
const plain = `<!doctype html><html><head><title>Sale</title><style>td{font-size:16px}</style></head>${SELLER_BODY}</html>`;

test("dark mode: a pasted document with nothing of its own gets color-scheme metas and rules for our parts only", () => {
  assert.equal(layout.documentDarkMode(plain), "none");
  const html = layout.wrapEmail({ bodyHtml: plain, brand: BRAND, compliance });
  assert.match(html, /<head><title>Sale<\/title><style>td\{font-size:16px\}<\/style><meta name="color-scheme" content="light dark" \/>\n<meta name="supported-color-schemes" content="light dark" \/>\n<style id="sib-pasted-dark">/);
  assert.equal(count(html, /name="color-scheme"/g), 1);
  const css = html.match(/<style id="sib-pasted-dark">([\s\S]*?)<\/style>/)[1];
  // Every rule is scoped to what we inject: the brand header or the footer.
  for (const selectorList of css.match(/[^{}@]+(?=\{[^{}]*!important)/g)) {
    for (const sel of selectorList.split(",")) assert.match(sel.trim(), /\.sib-brand-header|\.sib-foot/, sel);
  }
  assert.match(css, /@media \(prefers-color-scheme:dark\)/);
  assert.match(css, /\[data-ogsb\] \.sib-brand-header/);
  assert.match(css, /\.sib-foot \.sib-logo-dark\{display:block!important/, "the logo swap");
  assert.match(css, /#0A1C25/, "the shell's dark page colour");
  // The seller's own markup and colours are untouched.
  assert.ok(html.includes('<table style="background:#FFEEDD;color:#222"><tr><td style="color:#333">Sale!</td></tr></table>'));
  assert.ok(html.includes('<body style="margin:0;background:#ffffff">'));
});

test("dark mode: a document with its own dark mode keeps it; ours only follows; color-scheme light opts out", () => {
  const own = plain.replace("<style>td{font-size:16px}</style>", "<style>@media (prefers-color-scheme: dark){td{color:#fff!important}}</style>");
  assert.equal(layout.documentDarkMode(own), "dark");
  const html = layout.wrapEmail({ bodyHtml: own, brand: BRAND, compliance });
  assert.doesNotMatch(html, /name="color-scheme"/, "no metas added");
  assert.match(html, /<style id="sib-pasted-dark">/);
  assert.ok(html.includes("@media (prefers-color-scheme: dark){td{color:#fff!important}}"), "theirs left as is");

  const viaCss = plain.replace("td{font-size:16px}", ":root{color-scheme:light dark}");
  assert.equal(layout.documentDarkMode(viaCss), "dark");
  const light = plain.replace("<head>", '<head><meta name="color-scheme" content="light">');
  assert.equal(layout.documentDarkMode(light), "light-only");
  const lightHtml = layout.wrapEmail({ bodyHtml: light, brand: BRAND, compliance });
  assert.doesNotMatch(lightHtml, /sib-pasted-dark/, "they opted out of dark mode");
  assert.equal(layout.documentDarkMode(plain.replace("<style>", "<!-- @media (prefers-color-scheme:dark) --><style>")), "none", "comments don't count");
});

test("dark mode: the builder switch turns it off; <head> is created when missing; the markers never go out", () => {
  const off = layout.setDarkMode(plain, false);
  assert.equal(layout.darkModeOn(off), false);
  assert.equal(layout.setDarkMode(off, true), plain);
  const html = layout.wrapEmail({ bodyHtml: off, brand: BRAND, compliance });
  assert.doesNotMatch(html, /sib-pasted-dark|name="color-scheme"/);
  assert.doesNotMatch(html, /sib-dark:off/);
  const both = layout.setLogoHeader(layout.setDarkMode(plain, false), false);
  const bothHtml = layout.wrapEmail({ bodyHtml: both, brand: BRAND, compliance });
  assert.doesNotMatch(bothHtml, /sib-brand-header|sib-pasted-dark|sib-logo:off|sib-dark:off/);
  assert.match(bothHtml, /^<!doctype html>/);

  const noHead = layout.wrapEmail({ bodyHtml: "<html><body><p>Hi</p></body></html>", brand: BRAND, compliance });
  assert.match(noHead, /^<html>\n<head><meta name="color-scheme" content="light dark" \/>[\s\S]*<\/style>\n<\/head><body>/);
  assert.equal(count(noHead, /<head\b/g), 1);
  assert.doesNotMatch(preview.renderEmailPreview({ bodyHtml: off, brand: BRAND, shop: { name: "Ada", url: "https://ada.shopinbos.shop", appUrl: "https://app.example" } }), /sib-dark:off/);
  // Body content the shell lays out (not a pasted document) is unaffected: the shell already handles dark mode.
  assert.doesNotMatch(layout.wrapEmail({ bodyHtml: "<p>Hi</p>", brand: BRAND, compliance }), /sib-pasted-dark/);
  const builder = read("src/app/home/marketing/_kit/EmailBuilder.tsx");
  assert.match(builder, /label="Optimise for dark mode"/);
  assert.match(builder, /setDarkMode\(content\.bodyHtml, on\)/);
});
