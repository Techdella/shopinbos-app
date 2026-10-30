// Rex jobs: a paid Rex generation survives the seller dropping off, and the same "Generate" tap (clientKey) is
// never charged twice (shared/rex-jobs.ts, src/lib/ai/rex-jobs.server.ts, docs/migrations/2026-12-14-rex-jobs.sql).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const jobs = await import("../shared/rex-jobs.ts");

test("decideRexJob: start, pending, replay, retry after failure, take over a stale run", () => {
  const now = Date.parse("2026-12-14T12:00:00Z");
  assert.equal(jobs.decideRexJob(null, now), "start");
  assert.equal(jobs.decideRexJob({ status: "done", updatedAt: new Date(now - 1000) }, now), "replay");
  assert.equal(jobs.decideRexJob({ status: "failed", updatedAt: new Date(now - 1000) }, now), "retry");
  assert.equal(jobs.decideRexJob({ status: "running", updatedAt: new Date(now - 30_000) }, now), "pending");
  assert.equal(jobs.decideRexJob({ status: "queued", updatedAt: new Date(now - 30_000) }, now), "pending");
  assert.equal(jobs.decideRexJob({ status: "running", updatedAt: new Date(now - jobs.REX_JOB_STALE_MS - 1) }, now), "stale");
  // Longer than the longest Rex route (300 s), so a live run is never taken over.
  assert.ok(jobs.REX_JOB_STALE_MS > 300_000);
});

/**
 * The runRexJob rules in miniature: one row per (user, key); charge only inside a claimed run; a failure gives the
 * credits back and lets the same key run again; done replays without charging.
 */
function simulator() {
  const rows = new Map();
  const ledger = [];
  async function run(userId, clientKey, work) {
    const id = `${userId}:${clientKey}`;
    const existing = rows.get(id) ?? null;
    const decision = jobs.decideRexJob(existing);
    if (decision === "replay") return { status: "done", result: existing.result, replayed: true };
    if (decision === "pending") return { status: "pending" };
    rows.set(id, { status: "running", updatedAt: new Date(), creditsCharged: 0, result: null });
    const row = rows.get(id);
    const charges = [];
    try {
      const result = await work({
        charge: (credits) => {
          ledger.push(-credits);
          charges.push({ credits });
          row.creditsCharged += credits;
        },
      });
      Object.assign(row, { status: "done", result });
      return { status: "done", result, replayed: false };
    } catch (error) {
      const back = jobs.creditsHeld(charges);
      if (back) ledger.push(back);
      Object.assign(row, { status: "failed", creditsCharged: 0, error: String(error) });
      return { status: "failed" };
    }
  }
  return { run, rows, spent: () => 0 - ledger.reduce((sum, item) => sum + item, 0) || 0 };
}

test("the same clientKey is charged once: a retry after reconnecting gets the saved result free", async () => {
  const sim = simulator();
  const make = async (job) => {
    job.charge(20);
    return { logos: [{ url: "https://x.supabase.co/storage/v1/object/public/m/logo-1.png" }] };
  };
  const first = await sim.run("u1", "key-aaaaaaaa", make);
  const again = await sim.run("u1", "key-aaaaaaaa", make);
  const third = await sim.run("u1", "key-aaaaaaaa", make);
  assert.equal(first.status, "done");
  assert.equal(again.replayed, true);
  assert.deepEqual(again.result, first.result);
  assert.equal(third.replayed, true);
  assert.equal(sim.spent(), 20);
  // A new tap (new key) is a new charge.
  await sim.run("u1", "key-bbbbbbbb", make);
  assert.equal(sim.spent(), 40);
  // Another user's identical key is theirs alone.
  await sim.run("u2", "key-aaaaaaaa", make);
  assert.equal(sim.spent(), 60);
});

test("a twin request while the first is running is told to wait, not charged", async () => {
  const sim = simulator();
  let release;
  const slow = new Promise((resolve) => (release = resolve));
  const running = sim.run("u1", "key-cccccccc", async (job) => {
    job.charge(5);
    await slow;
    return { image: { url: "u" } };
  });
  const twin = await sim.run("u1", "key-cccccccc", async (job) => {
    job.charge(5);
    return {};
  });
  assert.equal(twin.status, "pending");
  release();
  assert.equal((await running).status, "done");
  assert.equal(sim.spent(), 5);
});

test("a failed job gives its credits back and the same key can run again (net one charge)", async () => {
  const sim = simulator();
  let attempt = 0;
  const flaky = async (job) => {
    job.charge(5);
    attempt += 1;
    if (attempt === 1) throw new Error("model down");
    return { url: "ok" };
  };
  assert.equal((await sim.run("u1", "key-dddddddd", flaky)).status, "failed");
  assert.equal(sim.spent(), 0);
  assert.equal((await sim.run("u1", "key-dddddddd", flaky)).status, "done");
  assert.equal(sim.spent(), 5);
  assert.equal((await sim.run("u1", "key-dddddddd", flaky)).replayed, true);
  assert.equal(sim.spent(), 5);
});

test("creditsHeld nets charges against partial refunds and never goes negative", () => {
  assert.equal(jobs.creditsHeld([{ credits: 20 }], [{ credits: 5 }]), 15);
  assert.equal(jobs.creditsHeld([{ credits: 5 }, { credits: 2 }]), 7);
  assert.equal(jobs.creditsHeld([{ credits: 1 }], [{ credits: 4 }]), 0);
});

test("clientKey: uuids pass, junk and missing keys run without a job (old app builds)", () => {
  assert.equal(jobs.cleanClientKey("0b8f8a2e-3c1d-4b8e-9f6a-1a2b3c4d5e6f"), "0b8f8a2e-3c1d-4b8e-9f6a-1a2b3c4d5e6f");
  assert.equal(jobs.cleanClientKey(undefined), null);
  assert.equal(jobs.cleanClientKey("short"), null);
  assert.equal(jobs.cleanClientKey("has spaces in it!"), null);
  assert.equal(jobs.cleanClientKey("x".repeat(81)), null);
});

test("trimRexInput keeps a short copy of the ask: no data URLs, long text cut, lists capped", () => {
  const trimmed = jobs.trimRexInput({ prompt: "a".repeat(1000), photo: "data:image/png;base64,AAAA", list: Array.from({ length: 20 }, (_, i) => i), deep: { a: { b: { c: { d: 1 } } } } });
  assert.ok(trimmed.prompt.length <= 401);
  assert.equal(trimmed.photo, "[data]");
  assert.equal(trimmed.list.length, 8);
  assert.deepEqual(trimmed.deep, { a: {} });
});

test("device keys: the same ask reuses its key until the result is shown; a different ask gets a new one", () => {
  const memory = new Map();
  const store = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  let n = 0;
  const make = () => `key-${++n}-xxxxxxxx`;
  const sig = jobs.rexRequestSignature("logo", { businessName: "Ada", round: 1 });
  const first = jobs.rexKeyFor(store, "logo", sig, make);
  assert.equal(jobs.rexKeyFor(store, "logo", sig, make), first);
  assert.equal(jobs.rexRequestSignature("logo", { round: 1, businessName: "Ada" }), sig, "key order doesn't matter");
  const other = jobs.rexKeyFor(store, "logo", jobs.rexRequestSignature("logo", { businessName: "Ada", round: 2 }), make);
  assert.notEqual(other, first);
  jobs.forgetRexKey(store, "logo");
  assert.notEqual(jobs.rexKeyFor(store, "logo", sig, make), first);
  // Old keys expire.
  const old = jobs.rexKeyFor(store, "img", "s", make, 0);
  assert.notEqual(jobs.rexKeyFor(store, "img", "s", make, jobs.REX_KEY_REUSE_MS + 1), old);
  // No storage (private mode): still a key, just not kept.
  assert.match(jobs.rexKeyFor(null, "logo", sig, make), /^key-/);
});

test("rexJobView and parseRexKinds", () => {
  const view = jobs.rexJobView({ id: "j", kind: "logo", status: "running", result: null, error: null, creditsCharged: 20, seenAt: null, createdAt: new Date(0), updatedAt: new Date(0) });
  assert.equal(view.status, "pending");
  assert.equal(view.seen, false);
  assert.deepEqual(jobs.parseRexKinds("logo,nope,image"), ["logo", "image"]);
  assert.ok(jobs.isRexPending({ pending: true, rexJobId: "x" }));
  assert.ok(!jobs.isRexPending({ logos: [] }));
});

test("the migration and the Prisma model match: unique (userId, clientKey), RLS on, additive", () => {
  const sql = read("docs/migrations/2026-12-14-rex-jobs.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "RexJob"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "RexJob_userId_clientKey_key" ON "RexJob" \("userId", "clientKey"\)/);
  assert.match(sql, /"RexJob_userId_status_updatedAt_idx" ON "RexJob" \("userId", "status", "updatedAt"\)/);
  assert.match(sql, /ALTER TABLE "RexJob" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DROP |DELETE FROM/);
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model RexJob {"));
  for (const field of ["userId", "storeId", "kind", "clientKey", "status", "input", "result", "creditsCharged", "error", "seenAt"]) assert.match(model, new RegExp(`\\n  ${field}\\s`), field);
  assert.match(model, /@@unique\(\[userId, clientKey\]\)/);
});

test("the server helper charges inside the job, refunds on failure and keeps working after a disconnect", () => {
  const helper = read("src/lib/ai/rex-jobs.server.ts");
  assert.match(helper, /import \{ after, type NextResponse \} from "next\/server"/);
  assert.match(helper, /after\(\(\) => promise/);
  assert.match(helper, /meterAiCharged\(/);
  assert.match(helper, /creditsCharged: \{ increment: delta \}/);
  assert.match(helper, /giveBackAll\(\)/);
  assert.match(helper, /status: "failed"/);
  // A stale run is retired (running → failed) by one caller before its credits go back.
  assert.match(helper, /updateMany\(\{\s*where: \{ id: job\.id, status: "running"/);
});

test("the paid Rex generators go through runRexJob and accept an optional clientKey", () => {
  const routes = [
    "src/app/api/ai/generate-logo/route.ts",
    "src/app/api/ai/generate-image/route.ts",
    "src/app/api/app/packaging/concept/route.ts",
    "src/app/api/mobile/banner/route.ts",
    "src/app/api/mobile/create/route.ts",
    "src/app/api/ai/video-script/route.ts",
    "src/app/api/ai/reel-shots/route.ts",
    "src/app/api/ai/voiceover/route.ts",
  ];
  for (const path of routes) {
    const source = read(path);
    assert.match(source, /runRexJob\(/, path);
    assert.match(source, /clientKey/, path);
    assert.match(source, /rexPendingBody\(/, path);
    // Charging happens inside the job, never before it.
    assert.doesNotMatch(source, /\bmeterAi(Charged)?\(user\.id/, path);
  }
  // The broken refund (a bare balance increment with no 12-month lot) is gone from Create with Rex.
  assert.doesNotMatch(read("src/app/api/mobile/create/route.ts"), /balance: \{ increment/);
  // The voiceover is stored for a job so a seller who left can get it back.
  assert.match(read("src/app/api/ai/voiceover/route.ts"), /uploadPublicFileAt\(/);
});

test("resume endpoints: list unseen, poll one, mark seen", () => {
  const list = read("src/app/api/app/rex-jobs/route.ts");
  assert.match(list, /searchParams\.get\("unseen"\) === "1"/);
  assert.match(list, /seenAt: new Date\(\)/);
  assert.match(list, /userId: user\.id/);
  assert.match(read("src/app/api/app/rex-jobs/[id]/route.ts"), /where: \{ id, userId: user\.id \}/);
});

test("web and phone send a clientKey per tap and pick up what Rex finished on the Rex screens", () => {
  const web = read("src/lib/ai/rex-jobs-client.ts");
  assert.match(web, /window\.localStorage/);
  assert.match(web, /clientKey/);
  const phone = read("apps/mobile/src/lib/rex-jobs.ts");
  assert.match(phone, /expo-sqlite\/localStorage\/install/);
  for (const path of ["src/components/onboarding/seller/api.ts", "src/app/studio/logo/LogoStudioClient.tsx", "src/app/studio/images/ImageGenClient.tsx", "src/app/home/labels/packaging/PackConceptStudio.tsx", "src/app/home/video/VideoStudio.tsx"]) {
    assert.match(read(path), /rexPost\(|rexPost</, path);
  }
  for (const path of ["src/components/onboarding/seller/SellerOnboarding.tsx", "src/app/studio/logo/LogoStudioClient.tsx", "src/app/studio/images/ImageGenClient.tsx", "src/app/home/video/VideoStudio.tsx", "apps/mobile/src/components/rex-build/design.tsx", "apps/mobile/src/components/rex-build/pages.tsx", "apps/mobile/src/app/onboarding/building.tsx", "apps/mobile/src/app/create/index.tsx"]) {
    assert.match(read(path), /useRexResume\(/, path);
  }
  for (const path of ["apps/mobile/src/lib/onboarding.ts", "apps/mobile/src/lib/seller-onboarding.ts", "apps/mobile/src/lib/banner.ts", "apps/mobile/src/lib/familiar.ts", "apps/mobile/src/lib/video.ts"]) assert.match(read(path), /rexApi</, path);
  assert.match(read("src/components/builder/rex/RexStudio.tsx"), /<RexFinishedStrip \/>/);
});

test("onboarding keeps Rex's logos and the step server-side, so logging back in shows the same logos", () => {
  const memory = read("src/lib/onboarding-memory.ts");
  assert.match(memory, /logoIdeas\?:/);
  assert.match(memory, /logoPicked\?:/);
  // The web sign-up draws logos; the phone's guided build keeps its answers in the same memory (rexBuild).
  for (const path of ["src/components/onboarding/seller/SellerOnboarding.tsx"]) {
    const source = read(path);
    assert.match(source, /saveMemory\(\{ logoIdeas: ideas, logoRound: round/, path);
    assert.match(source, /saveMemory\(\{ logoPicked: logo\.url \}\)/, path);
    assert.match(source, /logoIdeas/, path);
  }
});

test("the rexJobs words exist in all five languages", async () => {
  const catalog = (await import("../shared/i18n/messages/rexJobs/index.ts")).default;
  const keys = Object.keys(catalog.en);
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    for (const key of keys) assert.ok(catalog[locale][key], `${locale} ${key}`);
  }
  for (const kind of jobs.REX_JOB_KINDS) assert.ok(catalog.en[`kind.${kind}`], kind);
});
