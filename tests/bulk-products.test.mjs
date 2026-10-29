// "Add many with Peggy" (shared/bulk-products.ts, shared/bulk-upload-queue.ts, src/lib/products/bulk/): the reply
// parser in many phrasings (English and Pidgin, ₦, k, commas), 200-product sessions (group pricing, progress, asks),
// joining photos, publish chunking and idempotency, plan limits, the upload queue, and the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const bulk = await import("../shared/bulk-products.ts");
const { createUploadQueue } = await import("../shared/bulk-upload-queue.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const { PURCHASE_CTA } = await import("../shared/store-payments.ts");
const screens = await import("../shared/peggy-screens.ts");

const mk = (n, name, category = "", extra = {}) => ({
  id: `i${n}`, number: n, photos: [`https://cdn.example/p${n}.jpg`], name, description: "", category, priceKobo: null, hintLowKobo: null, hintHighKobo: null,
  stock: null, colours: [], lookKey: null, colour: null, aiState: "done", removed: false, productId: null, publishError: null, ...extra,
});
const five = () => [mk(1, "Black leather handbag", "Bags"), mk(2, "Red ankara dress", "Dresses"), mk(3, "Brown leather sandals", "Shoes"), mk(4, "Ankara head wrap", "Accessories"), mk(5, "", "")];
const prices = (result) => Object.fromEntries(result.changes.filter((c) => c.priceKobo).map((c) => [c.n, c.priceKobo / 100]));

// ─── Money ────────────────────────────────────────────────────────────────────

test("naira amounts: k, m, ₦, N, commas, naira, decimals; never zero or nonsense", () => {
  const cases = { "15k": 1_500_000, "15K": 1_500_000, "₦12,500": 1_250_000, "N5,000": 500_000, "5000 naira": 500_000, "1.5k": 150_000, "1.2m": 120_000_000, "2 million": 200_000_000, "20 thousand": 2_000_000, "12,500.50": 1_250_050, "NGN 7500": 750_000 };
  for (const [text, kobo] of Object.entries(cases)) assert.equal(bulk.parseNaira(text), kobo, text);
  for (const bad of ["", "0", "abc", "k", "-5", "15kg"]) assert.equal(bulk.parseNaira(bad), null, bad);
  assert.equal(bulk.koboFromField("₦8,000"), 800_000);
  assert.equal(bulk.fieldFromKobo(1_250_000), "12500");
});

// ─── Replies ──────────────────────────────────────────────────────────────────

test("prices by name, number and list, in English and Pidgin", () => {
  const items = five();
  const p = (text, context) => prices(bulk.parseReply(text, items, context));
  assert.deepEqual(p("bag 15k, dress 12,500, the shoes na 20k"), { 1: 15000, 2: 12500, 3: 20000 });
  assert.deepEqual(p("1 15000 and 2 12k"), { 1: 15000, 2: 12000 });
  assert.deepEqual(p("#3 - ₦9,000"), { 3: 9000 });
  assert.deepEqual(p("number 4 na 3500"), { 4: 3500 });
  assert.deepEqual(p("1, 2 and 4 are ₦7,500"), { 1: 7500, 2: 7500, 4: 7500 });
  assert.deepEqual(p("1-3 na 5000"), { 1: 5000, 2: 5000, 3: 5000 });
  assert.deepEqual(p("from 2 to 4 go for 6k"), { 2: 6000, 3: 6000, 4: 6000 });
  assert.deepEqual(p("all of them 5000"), { 1: 5000, 2: 5000, 3: 5000, 4: 5000, 5: 5000 });
  assert.deepEqual(p("everything ankara 8500"), { 2: 8500, 4: 8500 });
  assert.deepEqual(p("N12,000 for the bag"), { 1: 12000 });
  assert.deepEqual(p("bag na 15,000 naira"), { 1: 15000 });
  assert.deepEqual(p("1.5k for 4"), { 4: 1500 });
  assert.deepEqual(p("the bag and the shoes na 20k"), { 1: 20000, 3: 20000 });
  assert.deepEqual(p("abeg the sandals dey sell for 18k"), { 3: 18000 });
  // A bare price goes to what Peggy just asked about; "same as the last one" reuses the last price.
  assert.deepEqual(p("15k", { asking: [5] }), { 5: 15000 });
  assert.deepEqual(p("same price as the last one", { asking: [5], lastPriceKobo: 300_000 }), { 5: 3000 });
  assert.deepEqual(prices(bulk.parseReply("4 same as 1", bulk.applyChanges(items, [{ n: 1, priceKobo: 900_000 }]))), { 4: 9000 });
});

test("names, stock, categories, descriptions and removals", () => {
  const items = five();
  const r = (text) => bulk.parseReply(text, items).changes;
  assert.deepEqual(r("rename 2 to Ankara maxi dress"), [{ n: 2, name: "Ankara maxi dress" }]);
  assert.deepEqual(r("call 4 Silk head wrap"), [{ n: 4, name: "Silk head wrap" }]);
  assert.deepEqual(r("rename 2 to Ankara maxi and 3 to Leather slides"), [{ n: 2, name: "Ankara maxi" }, { n: 3, name: "Leather slides" }]);
  assert.deepEqual(r("remove 3"), [{ n: 3, removed: true }]);
  assert.deepEqual(r("comot 4 and 5"), [{ n: 4, removed: true }, { n: 5, removed: true }]);
  assert.deepEqual(r("remove 3, 4 and 5").map((c) => c.n), [3, 4, 5]);
  assert.deepEqual(r("stock for all 10").map((c) => c.stock), [10, 10, 10, 10, 10]);
  assert.deepEqual(r("2 has 5 pieces"), [{ n: 2, stock: 5 }]);
  assert.deepEqual(r("put 4 in Scarves"), [{ n: 4, category: "Scarves" }]);
  assert.deepEqual(r("describe 1 as Real leather, fits a laptop"), [{ n: 1, description: "Real leather, fits a laptop" }]);
  // A product with no name yet takes one from "N <name> <price>"; a named one keeps its name.
  assert.deepEqual(r("5 black tote bag 15k"), [{ n: 5, priceKobo: 1_500_000, name: "Black tote bag" }]);
  assert.deepEqual(r("1 bag 9k"), [{ n: 1, priceKobo: 900_000 }]);
});

test("Peggy asks instead of guessing: ranges, several matches, unknown numbers, gibberish", () => {
  const items = five();
  const range = bulk.parseReply("dresses 12k to 18k by size", items);
  assert.deepEqual(range.changes, []);
  assert.deepEqual(range.questions, [{ kind: "range", ref: "dresses", lowKobo: 1_200_000, highKobo: 1_800_000, numbers: [2] }]);
  const which = bulk.parseReply("leather 9k", items);
  assert.deepEqual(which.questions, [{ kind: "which", ref: "leather", numbers: [1, 3] }]);
  assert.deepEqual(bulk.parseReply("10 5k", items).questions, [{ kind: "unknownNumber", n: 10 }]);
  const junk = bulk.parseReply("blah blah", items);
  assert.equal(junk.complete, false);
  assert.deepEqual(junk.unknown, ["blah blah"]);
  // "2 5" is not a ₦5 price.
  assert.deepEqual(bulk.parseReply("2 5", items).changes, []);
  // Removed and published products are never changed.
  const done = bulk.applyChanges(items, [{ n: 1, removed: true }]);
  assert.deepEqual(bulk.parseReply("1 5000", done).questions, [{ kind: "unknownNumber", n: 1 }]);
});

// ─── 200 products ─────────────────────────────────────────────────────────────

function twoHundred() {
  const out = [];
  let n = 1;
  for (let i = 0; i < 40; i++) out.push(mk(n++, `${["Black", "Brown", "Tan", "Red"][i % 4]} leather tote bag`, "Bags"));
  for (let i = 0; i < 60; i++) out.push(mk(n++, `${i % 2 ? "White" : "Black"} canvas sneakers`, "Shoes"));
  for (let i = 0; i < 50; i++) out.push(mk(n++, i < 20 ? "Ankara maxi dress" : "Lace gown", "Dresses"));
  for (let i = 0; i < 30; i++) out.push(mk(n++, "Fitted baseball cap", "Caps"));
  for (let i = 0; i < 20; i++) out.push(mk(n++, "", "", { aiState: "skipped" }));
  return out;
}

test("200 products: priced by group, range and pattern in a few replies; Peggy asks a group at a time", () => {
  let items = twoHundred();
  assert.equal(items.length, 200);
  let summary = bulk.summarize(items);
  assert.equal(summary.left, 200);
  assert.deepEqual(bulk.nextAsk(items), { kind: "group", category: "Shoes", count: 60, numbers: items.filter((i) => i.category === "Shoes").map((i) => i.number) });
  assert.equal(bulk.summaryLine(summary, (key, v) => `${key}:${JSON.stringify(v)}`), 'peggy.progressBy:{"priced":0,"left":200,"groups":"60 shoes, 50 dresses, 40 bags"}');

  const step = (text, ask) => {
    const result = bulk.parseReply(text, items, { asking: bulk.askNumbers(ask, items) });
    items = bulk.applyChanges(items, result.changes);
    return result;
  };
  assert.equal(step("all the bags 15k").changes.length, 40);
  assert.equal(step("all shoes na 20,000").changes.length, 60);
  assert.equal(step("everything ankara 18500").changes.length, 20);
  assert.equal(step("lace gowns 25k").changes.length, 30);
  summary = bulk.summarize(items);
  assert.deepEqual([summary.priced, summary.left], [150, 50]);
  assert.deepEqual(summary.unpricedBy, [{ category: "Caps", count: 30 }, { category: "", count: 20 }]);
  // The group Peggy asks about takes a bare price.
  const ask = bulk.nextAsk(items);
  assert.equal(ask.kind, "group");
  assert.equal(ask.category, "Caps");
  assert.equal(step("6500", ask).changes.length, 30);
  // The last 20 have no names: by number range, then names by number.
  assert.deepEqual(bulk.nextAsk(items), { kind: "range", from: 181, to: 200, count: 20 });
  assert.equal(step("181-200 na 5000").changes.length, 20);
  assert.equal(bulk.nextAsk(items).kind, "names");
  step("rename 181 to Beaded clutch");
  assert.equal(items.find((i) => i.number === 181).name, "Beaded clutch");
  assert.equal(bulk.summarize(items).left, 0);
  // Big replies read as a few lines, not 200.
  const lines = bulk.changeLines([...Array(40)].map((_, i) => ({ n: i + 1, priceKobo: 1_500_000 })), items, (k, v) => `${k}:${v?.numbers ?? ""}`, (k) => `₦${k / 100}`);
  assert.deepEqual(lines, ["peggy.linePriceMany:1-40"]);
  const stock = bulk.changeLines([...Array(30)].map((_, i) => ({ n: i + 151, stock: 10 })), items, (k, v) => `${k}:${v?.numbers ?? v?.n}`, (k) => `₦${k / 100}`);
  assert.deepEqual(stock, ["peggy.lineStockMany:151-180"], "stock for a group is one line too");
  // "I've looked at all of them" waits for the last upload (the client sends more: true until then).
  assert.match(read("src/lib/products/bulk/vision.server.ts"), /!pending && !options\.more/);
});

test("filters and categories scale to 200", () => {
  const items = bulk.applyChanges(twoHundred(), [{ n: 1, priceKobo: 100_000 }]);
  assert.equal(bulk.filterItems(items, "all").length, 200);
  assert.equal(bulk.filterItems(items, "needsName").length, 20);
  assert.equal(bulk.filterItems(items, "needsPrice").length, 179);
  assert.equal(bulk.filterItems(items, "ready").length, 1);
  assert.equal(bulk.filterItems(items, "cat:shoes").length, 60);
  assert.deepEqual(bulk.categoriesOf(items).map((c) => c.name), ["Shoes", "Dresses", "Bags", "Caps"]);
});

// ─── Joining photos ───────────────────────────────────────────────────────────

test("Peggy suggests joining photos of the same product: angles for everyone, colours as options for sellers", () => {
  const items = [
    mk(1, "Black leather tote", "Bags", { lookKey: "leather-tote", colour: "black" }),
    mk(2, "Black leather tote", "Bags", { lookKey: "leather-tote", colour: "black" }),
    mk(3, "Red ankara dress", "Dresses", { lookKey: "ankara-dress", colour: "red" }),
    mk(4, "Blue ankara dress", "Dresses", { lookKey: "ankara-dress", colour: "blue" }),
    mk(5, "Green ankara dress", "Dresses", { lookKey: "ankara-dress", colour: "green" }),
    mk(6, "Cap", "Caps", { lookKey: "cap" }),
  ];
  const seller = bulk.suggestGroups(items, "seller");
  assert.deepEqual(seller.map((g) => [g.kind, g.numbers]), [["angles", [1, 2]], ["colours", [3, 4, 5]]]);
  assert.deepEqual(bulk.suggestGroups(items, "supplier").map((g) => g.kind), ["angles"], "no versions on supplier products");
  assert.deepEqual(bulk.suggestGroups(items, "seller", [seller[0].key]).map((g) => g.kind), ["colours"], "a No is remembered");

  const angles = bulk.joinItems(items, [1, 2], "angles");
  assert.deepEqual(angles.keep.photos, ["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"]);
  assert.deepEqual(angles.removed, [2]);
  const colours = bulk.joinItems(bulk.applyChanges(items, [{ n: 4, priceKobo: 1_000_000 }]), [3, 4, 5], "colours");
  assert.deepEqual(colours.keep.colours, ["red", "blue", "green"]);
  assert.equal(colours.keep.name, "Ankara dress", "the colour leaves the name");
  assert.equal(colours.keep.priceKobo, 1_000_000, "a price given to any of them is kept");
  assert.equal(bulk.joinItems(items, [1], "angles"), null);
});

// ─── Publishing ───────────────────────────────────────────────────────────────

test("publish: chunks of 20, ready ones only, idempotent over retries, plan limits respected", () => {
  let items = twoHundred().map((item, index) => ({ ...item, name: item.name || `Item ${index}`, priceKobo: index < 190 ? 500_000 : null }));
  const created = new Map();
  let calls = 0;
  // Simulates the server: each call publishes its batch, a "crash" on call 3 after 5 products (their ids were saved).
  for (;;) {
    const plan = bulk.planPublish(items, null);
    if (!plan.batch.length) break;
    calls++;
    assert.ok(plan.batch.length <= bulk.BULK_PUBLISH_CHUNK);
    const batch = calls === 3 ? plan.batch.slice(0, 5) : plan.batch;
    for (const item of batch) {
      assert.ok(!created.has(item.id), `no second product for ${item.number}`);
      created.set(item.id, `prod_${item.number}`);
      items = items.map((row) => (row.id === item.id ? { ...row, productId: `prod_${item.number}` } : row));
    }
  }
  assert.equal(created.size, 190);
  assert.equal(calls, 11);
  assert.equal(bulk.planPublish(items, null).notReady, 10, "the 10 without a price stay as drafts");

  // Plan limit: room for 50 → 20 now, 30 more later, 140 kept.
  const fresh = twoHundred().map((item) => ({ ...item, name: item.name || "Thing", priceKobo: 100_000 }));
  const limited = bulk.planPublish(fresh, 50);
  assert.deepEqual([limited.batch.length, limited.remaining, limited.overLimit], [20, 30, 150]);
  assert.deepEqual(bulk.planPublish(fresh, 0).batch, []);
  // Retrying only some (the failed ones).
  assert.deepEqual(bulk.planPublish(fresh, null, 20, ["i7", "i9"]).batch.map((i) => i.number), [7, 9]);
});

test("publish on the server: claimed once, product found by its photo before making it, ids saved, kobo to naira", () => {
  const source = read("src/lib/products/bulk/publish.server.ts");
  assert.match(source, /status: "open" \}, \{ status: "publishing", updatedAt: \{ lt:/, "one publish per session, a stuck one released after a while");
  assert.match(source, /db\.storeProduct\.findFirst\(\{ where: \{ storeId: store\.id, images: \{ has: photo \} \}/);
  assert.match(source, /db\.supplierProduct\.findFirst\(\{ where: \{ supplierId: supplier\.id, images: \{ has: photo \} \}/);
  assert.match(source, /data: \{ productId: product\.id, publishError: null \}/);
  assert.match(source, /retailPrice: item\.priceKobo! \/ 100/);
  assert.match(source, /wholesalePrice: naira/);
  assert.match(source, /productsLeft\(session\.userId, store\.id\)/);
  assert.match(source, /supplierPlanLimits\(dbUser \?\? \{\}\)\.listings/);
  assert.match(source, /status: options\.live \? "published" : "draft"/);
  assert.match(source, /status: options\.live && verified \? "pending_review" : "draft"/);
  assert.match(source, /withShortCode\(store\.id/);
});

// ─── Uploads ──────────────────────────────────────────────────────────────────

test("upload queue: 200 photos, 3 at a time, retried, progress, failures kept for Try again", async () => {
  let active = 0;
  let peak = 0;
  const attempts = new Map();
  const seen = [];
  const queue = createUploadQueue({
    concurrency: 3,
    sleep: () => Promise.resolve(),
    upload: async (task, onProgress) => {
      active++;
      peak = Math.max(peak, active);
      attempts.set(task.clientKey, (attempts.get(task.clientKey) ?? 0) + 1);
      onProgress(0.5);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      if (task.clientKey === "k7" && attempts.get("k7") < 2) throw new Error("network");
      if (task.clientKey === "k9") throw Object.assign(new Error("too big"), { status: 413 });
      if (task.clientKey === "k11") throw new Error("always offline");
    },
    isFinal: (error) => error.status === 413,
    onChange: (snapshot) => seen.push(snapshot),
  });
  const tasks = Array.from({ length: 200 }, (_, i) => ({ clientKey: `k${i}`, fileName: `IMG_${i}.jpg`, state: "waiting", progress: 0, tries: 0 }));
  queue.add(tasks);
  queue.add(tasks.slice(0, 5)); // picked twice: not queued twice
  await queue.whenIdle();
  const done = queue.snapshot();
  assert.equal(done.total, 200);
  assert.equal(done.done, 198);
  assert.equal(done.failed, 2);
  assert.ok(peak <= 3, `at most 3 at once (saw ${peak})`);
  assert.equal(attempts.get("k7"), 2, "a dropped upload is tried again");
  assert.equal(attempts.get("k9"), 1, "a refused photo isn't retried");
  assert.equal(attempts.get("k11"), 3, "three tries, then it shows as failed");
  assert.ok(seen.some((s) => s.fraction > 0 && s.fraction < 1));
  queue.retryFailed();
  await queue.whenIdle();
  assert.equal(attempts.get("k11"), 6);
});

test("uploads server-side: one product per photo, a retried upload makes no second one, photos resized", () => {
  const routes = read("src/lib/products/bulk/routes.server.ts");
  assert.match(routes, /sessionId_clientKey: \{ sessionId: session\.id, clientKey \}/);
  assert.match(routes, /checkRateLimitShared\(rateLimitKey\("bulk-photo", user\.id\)/);
  const session = read("src/lib/products/bulk/session.server.ts");
  assert.match(session, /nextNumber: \{ increment: 1 \}/, "numbers taken atomically");
  assert.match(session, /if \(count >= BULK_MAX_ITEMS\)/);
  const vision = read("src/lib/products/bulk/vision.server.ts");
  assert.match(vision, /\.resize\(\{ width: BULK_PHOTO_MAX_SIDE, height: BULK_PHOTO_MAX_SIDE, fit: "inside"/);
  assert.match(read("src/components/products/bulk/client.ts"), /canvas\.toBlob\(resolve, "image\/jpeg", 0\.82\)/, "the browser shrinks photos before upload");
  assert.match(read("apps/mobile/src/app/bulk-add.tsx"), /allowsMultipleSelection: true, selectionLimit: Math\.min\(200, room\), quality: 0\.6/);
  assert.match(read("apps/mobile/src/lib/bulk-add.ts"), /localStorage\.setItem\(KEY\(sessionId\)/, "the phone keeps the waiting list");
});

// ─── AI and cost controls ─────────────────────────────────────────────────────

test("AI: vision in batches of 10 at 512px, one metered use per photo, blank drafts when off or capped; replies read without AI first", () => {
  assert.equal(bulk.BULK_VISION_BATCH, 10);
  const vision = read("src/lib/products/bulk/vision.server.ts");
  assert.match(vision, /take: BULK_VISION_BATCH/);
  assert.match(vision, /const AI_SIDE = 512/);
  assert.match(vision, /detail: "low"/);
  assert.match(vision, /meterAi\(session\.userId, "text", batch\.length, "bulk_description"\)/);
  assert.match(vision, /aiState: "skipped"/);
  assert.match(vision, /aiState: token, aiClaimedAt: new Date\(\)/, "a batch is claimed, so two calls never read the same photos");
  assert.doesNotMatch(vision, /priceKobo:/, "Peggy never sets a price");
  assert.match(vision, /hintLowKobo/);
  const reply = read("src/lib/products/bulk/reply.server.ts");
  assert.match(reply, /if \(!parsed\.complete\) \{/);
  assert.match(reply, /checkRateLimitShared\(rateLimitKey\("bulk-reply-ai", userId\), \{ maxRequests: 20, windowMs: 60_000 \}\)/);
  assert.match(reply, /meterAi\(userId, "text", 1, "chat_reply"\)/);
  assert.match(reply, /const AiAnswer = z\.object/);
});

// ─── Wiring ───────────────────────────────────────────────────────────────────

test("API: phone and web share the handlers; sellers and suppliers only; zod on every body", () => {
  for (const base of ["src/app/api/mobile/bulk-products", "src/app/api/app/bulk-products"]) {
    for (const [path, handler] of [["route.ts", "listHandler as GET, createHandler as POST"], ["[id]/route.ts", "getHandler as GET, deleteHandler as DELETE"], ["[id]/photos/route.ts", "photoHandler as POST"], ["[id]/look/route.ts", "lookHandler as POST"], ["[id]/reply/route.ts", "replyHandler as POST"], ["[id]/items/route.ts", "itemsHandler as PATCH"], ["[id]/publish/route.ts", "publishHandler as POST"]]) {
      assert.match(read(`${base}/${path}`), new RegExp(handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${base}/${path}`);
    }
  }
  const routes = read("src/lib/products/bulk/routes.server.ts");
  assert.match(routes, /withAuth\([\s\S]*\["seller", "supplier"\]\)/);
  for (const schema of ["ReplySchema", "ItemsOp", "PublishSchema"]) assert.match(routes, new RegExp(`${schema}\\.safeParse`));
  assert.match(routes, /findSession\(userId, id\)/, "always the person's own session");
  assert.match(read("src/lib/products/bulk/session.server.ts"), /where: \{ id, userId, status:/);
});

test("schema: two additive tables with RLS on, money in kobo", () => {
  const sql = read("docs/migrations/2026-12-06-bulk-add-with-peggy.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "BulkProductSession"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "BulkProductItem"/);
  assert.match(sql, /"priceKobo" INTEGER/);
  assert.match(sql, /ALTER TABLE "BulkProductItem" ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(sql, /\bDROP\b|ALTER COLUMN/i);
  const prisma = read("prisma/schema.prisma");
  assert.match(prisma, /model BulkProductSession \{/);
  assert.match(prisma, /@@unique\(\[sessionId, clientKey\]\)/);
});

test("words: every key in five languages, Peggy's lines rendered, no purchase prompts", () => {
  const catalog = CATALOGS.bulkAdd;
  for (const lang of ["pcm", "yo", "ha", "ig"]) for (const key of Object.keys(catalog.en)) assert.ok(catalog[lang][key], `${lang} ${key}`);
  for (const lang of Object.keys(catalog)) for (const [key, value] of Object.entries(catalog[lang])) assert.doesNotMatch(value, PURCHASE_CTA, `${lang} ${key}`);
  const t = (key, values = {}) => {
    const text = catalog.en[key];
    assert.ok(text, `missing ${key}`);
    return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  };
  const items = five();
  const result = bulk.parseReply("bag 15k, remove 5, leather 2k", items);
  const after = bulk.applyChanges(items, result.changes);
  const event = { id: "e", at: "", from: "peggy", kind: "applied", changes: result.changes, unknown: result.unknown, questions: result.questions, summary: bulk.summarize(after), ask: bulk.nextAsk(after) };
  const lines = bulk.eventLines(event, after, t, (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`);
  assert.match(lines[0], /^Done:\n• 1\. Black leather handbag: ₦15,000\n• Removed 5$/);
  assert.match(lines.join("\n"), /"leather" matches 2 products \(1, 3\)/);
});

test("entry points: phone (+ sheet, Add a product, Products, My shop, supplier catalogue), web (both product pages), Peggy's screens", () => {
  assert.match(read("apps/mobile/src/components/CreateSheet.tsx"), /testID="create-bulk-add"[\s\S]*go\("\/bulk-add"\)/);
  assert.match(read("apps/mobile/src/app/add-products.tsx"), /testID="add-bulk"/);
  assert.match(read("apps/mobile/src/app/(tabs)/products.tsx"), /testID="products-bulk-add"/);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /testID="shop-bulk-add"/);
  assert.match(read("apps/mobile/src/app/supplier/(tabs)/products.tsx"), /testID="supplier-bulk-add"/);
  assert.match(read("src/app/products/page.tsx"), /href="\/products\/bulk"/);
  assert.match(read("src/app/supplier/products/page.tsx"), /href="\/supplier\/products\/bulk"/);
  assert.ok(existsSync(join(root, "src/app/products/bulk/page.tsx")));
  assert.ok(existsSync(join(root, "src/app/supplier/products/bulk/page.tsx")));
  assert.equal(screens.findScreen("seller", "bulk upload").app, "/bulk-add");
  assert.equal(screens.findScreen("supplier", "Add many with Peggy").web, "/supplier/products/bulk");
  // The spreadsheet import matches photos uploaded here by file name.
  assert.match(read("src/app/api/products/import/route.ts"), /withBulkPhotos\(user\.id, parseImageMap/);
});

// ─── WhatsApp catalogue screenshots ───────────────────────────────────────────

test("catalogue screenshots: names and prices as written, photo boxes kept inside the screenshot", () => {
  const found = bulk.readCatalogueProducts({
    products: [
      { name: "  Ankara  fabric, 6 yards ", price: "₦12,500", description: "Cotton", category: "Fabrics", box: { x: 0.05, y: 0.1, w: 0.3, h: 0.15 } },
      { name: "Leather bag", price: 15000, box: { x: 0.9, y: 0.95, w: 0.5, h: 0.5 } },
      { name: "Shea butter", price: "", box: { x: "a" } },
      { name: "x", price: "₦500" },
      "nonsense",
    ],
  });
  assert.deepEqual(found.map((p) => [p.name, p.priceKobo]), [["Ankara fabric, 6 yards", 1_250_000], ["Leather bag", 1_500_000], ["Shea butter", null]]);
  assert.deepEqual(found[0].box, { x: 0.05, y: 0.1, w: 0.3, h: 0.15 });
  assert.equal(found[1].box.w <= 0.1 + 1e-9 && found[1].box.h <= 0.05 + 1e-9, true);
  assert.equal(found[2].box, null);
  assert.deepEqual(bulk.readCatalogueProducts(null), []);
  assert.equal(bulk.readCatalogueProducts({ products: Array.from({ length: 30 }, (_, i) => ({ name: `Item ${i}` })) }).length, bulk.CATALOGUE_MAX_PER_SCREENSHOT);
  assert.equal(bulk.catalogueBox({ x: 0.1, y: 0.1, w: 0.01, h: 0.5 }), null);
  const rect = bulk.cropRect({ x: 0, y: 0.5, w: 1, h: 0.5 }, 1000, 2000);
  assert.deepEqual(rect, { left: 0, top: 980, width: 1000, height: 1020 });
});

test("catalogue screenshots are wired into Add many with Peggy for sellers and suppliers", () => {
  for (const base of ["app", "mobile"]) assert.match(read(`src/app/api/${base}/bulk-products/[id]/catalogue/route.ts`), /catalogueHandler as POST/);
  assert.match(read("src/lib/products/bulk/routes.server.ts"), /addCatalogueScreenshot\(session, role, file, clientKey\)/);
  assert.match(read("src/components/products/bulk/BulkAddWithPeggy.tsx"), /bulkApi\.catalogue\(/);
  assert.ok(CATALOGS.bulkAdd.en["catalogue.choose"]);
});
