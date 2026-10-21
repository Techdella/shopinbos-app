// Create with Rex and the posts calendar in the phone app (shared/create-with-rex.ts): role-aware ideas, design sizes,
// post rules and which scheduled posts get their one "Time to post" reminder, plus the routes, cron and migration.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rex = await import("../shared/create-with-rex.ts");
const notifications = await import("../shared/notifications.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test("ideas: specific ones from the person's data come first, evergreen ones always follow", () => {
  const seller = rex.selectIdeas("seller", {
    name: "Ada's Hair Lounge",
    link: "adashairlounge.mybos.store",
    newest: { id: "p1", name: "Lace front wig", price: "₦45,000", image: "https://x/wig.jpg" },
    deal: { id: "p2", name: "Chunky sneakers", price: "₦22,000", image: null, wasPrice: "₦28,000" },
    deliveredTo: "Kano",
  });
  assert.equal(seller[0].id, "new-stock:p1");
  assert.equal(seller[0].format, "status");
  assert.match(seller[0].caption, /Lace front wig, ₦45,000.*adashairlounge\.mybos\.store/);
  assert.equal(seller[0].imageUrl, "https://x/wig.jpg");
  assert.equal(seller[1].title, "Weekend price drop");
  assert.equal(seller[1].format, "reel");
  assert.ok(seller.some((idea) => idea.title === "Delivered to Kano"));
  assert.equal(new Set(seller.map((idea) => idea.id)).size, seller.length, "ids are unique");

  const empty = rex.selectIdeas("seller", {});
  assert.ok(empty.length >= 3, "no data still gives ideas");
  assert.ok(empty.every((idea) => !idea.id.includes(":") || idea.id.startsWith("delivered")));

  const supplier = rex.selectIdeas("supplier", {
    name: "Aba Leatherworks",
    newest: { id: "s1", name: "Unisex runners", price: "₦15,500", image: null },
    bulk: { id: "s2", name: "Beaded bangles", unitPrice: "₦2,600", minQty: 50, image: null },
  });
  assert.deepEqual(supplier.slice(0, 2).map((idea) => idea.id), ["new-for-shops:s1", "bulk:s2"]);
  assert.equal(supplier[1].subline, "₦2,600 each for 50+");
  assert.match(supplier[0].caption, /find Aba Leatherworks on Shopinbos/);

  const partner = rex.selectIdeas("logistics_partner", { name: "Swift Dispatch", newRoute: { to: "Abuja", price: "₦6,500" }, pickupPoint: { name: "Yaba", address: "14 Herbert Macaulay Way", hours: "Mon to Sat" } });
  assert.equal(partner[0].title, "Now delivering to Abuja");
  assert.equal(partner[1].title, "New pickup point: Yaba");
  assert.ok(partner.some((idea) => idea.id === "connect"));

  // The same facts give the same ids, so POST /api/mobile/create can find the idea again.
  assert.deepEqual(rex.selectIdeas("supplier", { newest: { id: "s1", name: "A", price: "₦1", image: null } }).map((i) => i.id), rex.selectIdeas("supplier", { newest: { id: "s1", name: "A", price: "₦1", image: null } }).map((i) => i.id));
  // The API sends only the contract's fields.
  assert.deepEqual(Object.keys(rex.publicIdea(seller[0])).sort(), ["format", "id", "line", "title"]);
});

test("a free-text prompt becomes its own idea on top of the base idea's photo", () => {
  const base = rex.selectIdeas("seller", { newest: { id: "p1", name: "Wig", price: "₦1", image: "https://x/a.jpg" } })[0];
  const idea = rex.ideaFromPrompt("Make a 20% off banner for the weekend sale on all our lace wigs and bundles", "post", base);
  assert.equal(idea.format, "post");
  assert.equal(idea.imageUrl, "https://x/a.jpg");
  assert.ok(idea.headline.length <= 42, idea.headline);
  assert.ok(idea.headline.endsWith("…"));
});

test("designs: 3 per job at the format's size", () => {
  const sizes = { status: [1080, 1920], reel: [1080, 1920], post: [1080, 1080], flyer: [1080, 1350] };
  for (const [format, [width, height]] of Object.entries(sizes)) {
    for (const hasPhoto of [true, false]) {
      const specs = rex.designSpecs(format, hasPhoto);
      assert.equal(specs.length, rex.DESIGNS_PER_JOB);
      assert.deepEqual(specs.map((spec) => spec.n), [1, 2, 3]);
      for (const spec of specs) {
        assert.equal(spec.width, width, format);
        assert.equal(spec.height, height, format);
        assert.equal(spec.playMark, format === "reel");
        assert.equal(spec.footer, format === "flyer");
      }
      assert.equal(specs.some((spec) => spec.style === "photo"), hasPhoto, "the full-bleed photo design needs a photo");
    }
  }
  assert.equal(rex.isCreateFormat("flyer"), true);
  assert.equal(rex.isCreateFormat("story"), false);
  assert.equal(rex.designId("cjob123456789", 2), "cjob123456789-2");
  assert.deepEqual(rex.parseDesignId("cjob123456789-2"), { jobId: "cjob123456789", n: 2 });
  assert.equal(rex.parseDesignId("../x-1"), null);
  assert.equal(rex.parseDesignId("cjob123456789-12"), null);
});

test("design colours and captions", () => {
  assert.deepEqual(rex.designPalette(null), { hero: "#0E2A38", accent: "#73D8C8", paper: "#F4F1EA", ink: "#0E2A38" });
  assert.equal(rex.designPalette({ hero: "#B33A1C", accent: "nope" }).accent, "#73D8C8");
  assert.equal(rex.textOn("#0E2A38"), "#FFFFFF");
  assert.equal(rex.textOn("#F4F1EA"), "#0E2A38");
  assert.deepEqual(rex.captionsFor("1. New stock just landed today\n- Fresh wigs, order now\n“Another line here”", "x"), ["New stock just landed today", "Fresh wigs, order now", "Another line here"]);
  assert.deepEqual(rex.captionsFor(null, "Fallback caption"), ["Fallback caption", "Fallback caption", "Fallback caption"]);
  assert.equal(rex.captionsFor("ok\nshort", "Fallback caption").length, 3);
});

test("reminders: scheduled, due, not more than a day late, and only once", () => {
  const now = new Date("2026-11-20T09:00:00Z");
  const posts = [
    { id: "due", status: "scheduled", scheduledAt: "2026-11-20T08:59:00Z", remindedAt: null },
    { id: "future", status: "scheduled", scheduledAt: "2026-11-20T09:30:00Z", remindedAt: null },
    { id: "reminded", status: "scheduled", scheduledAt: "2026-11-20T08:00:00Z", remindedAt: "2026-11-20T08:00:30Z" },
    { id: "draft", status: "draft", scheduledAt: "2026-11-20T08:00:00Z", remindedAt: null },
    { id: "posted", status: "posted", scheduledAt: "2026-11-20T08:00:00Z", remindedAt: null },
    { id: "stale", status: "scheduled", scheduledAt: "2026-11-18T08:00:00Z", remindedAt: null },
    { id: "exact", status: "scheduled", scheduledAt: now, remindedAt: null },
    { id: "no-time", status: "scheduled", scheduledAt: null, remindedAt: null },
  ];
  assert.deepEqual(rex.dueReminders(posts, now).map((post) => post.id), ["due", "exact"]);
  assert.equal(rex.reminderText("New stock just landed. Lace front wig, 22 inch, ₦45,000. Delivery all over Nigeria."), "Time to post: New stock just landed. Lace front wig, 22 inch, ₦45,000.…");
  assert.equal(rex.reminderText("Short one"), "Time to post: Short one");
  assert.equal(rex.reminderText(""), "Time to post: your post");
  assert.equal(rex.postLink("abc"), "app:/posts/abc");
  // The push opens the phone app's post screen.
  assert.deepEqual(notifications.appRouteFor("app:/posts/abc"), { pathname: "/posts/[id]", params: { id: "abc" } });
});

test("posts: platforms, status after a change and the accounts row", () => {
  assert.deepEqual(rex.cleanPlatforms(["TikTok", "whatsapp", "x", "whatsapp"]), ["whatsapp", "tiktok"]);
  assert.equal(rex.postStatusFor({ scheduledAt: new Date() }), "scheduled");
  assert.equal(rex.postStatusFor({ scheduledAt: null }), "draft");
  assert.equal(rex.postStatusFor({ current: "posted", scheduledAt: null }), "posted");
  assert.equal(rex.postStatusFor({ current: "scheduled", scheduledAt: new Date(), markPosted: true }), "posted");

  const none = rex.postAccounts([]);
  assert.deepEqual(none.map((a) => a.key), ["whatsapp", "instagram", "facebook", "tiktok"]);
  assert.ok(none.every((a) => a.linked === false));
  const linked = rex.postAccounts([{ channel: "meta", status: "connected" }, { channel: "tiktok", status: "error" }, { channel: "whatsapp", status: null, tokenEnc: true }]);
  assert.deepEqual(Object.fromEntries(linked.map((a) => [a.key, a.linked])), { whatsapp: true, instagram: true, facebook: true, tiktok: false });
});

test("wiring: routes for every role, metered, a protected once-only cron, schedule and migration", () => {
  for (const path of ["src/app/api/mobile/create/route.ts", "src/app/api/mobile/create/[id]/route.ts", "src/app/api/mobile/create/ideas/route.ts", "src/app/api/mobile/posts/route.ts", "src/app/api/mobile/posts/[id]/route.ts"]) {
    const source = read(path);
    assert.match(source, /withAuth\(/, path);
    assert.match(source, /"seller", "supplier", "logistics_partner"/, path);
    assert.doesNotMatch(source, /withSeller/, path);
  }
  const create = read("src/app/api/mobile/create/route.ts");
  assert.match(create, /meterAi\(user\.id, CREATE_USAGE_KIND\)/);
  assert.match(create, /if \(limited\) return limited;/);

  const cron = read("src/app/api/cron/post-reminders/route.ts");
  assert.match(cron, /cronDenied\(req\)/);
  const posts = read("src/lib/create/posts.server.ts");
  assert.match(posts, /updateMany\(\{ where: \{ id: post\.id, remindedAt: null, status: "scheduled" \}/, "claimed before sending");
  assert.match(posts, /dedupeKey: `post-reminder:\$\{post\.id\}`/);
  assert.match(read("scripts/qstash-schedules.mjs"), /path: "\/api\/cron\/post-reminders"/);

  assert.ok(exists("docs/migrations/2026-11-18-create-posts.sql"));
  const sql = read("docs/migrations/2026-11-18-create-posts.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "CreateJob"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ScheduledPost"/);
  assert.doesNotMatch(sql, /DROP |ALTER TABLE "(?!CreateJob|ScheduledPost)/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /\/\/ ─── Create with Rex and posts ─+\n/);
  assert.match(schema, /model CreateJob \{/);
  assert.match(schema, /model ScheduledPost \{[\s\S]*remindedAt\s+DateTime\?/);

  // Credits are never sold in the app: the top-up only emails the website steps.
  const topup = read("src/app/api/mobile/credits/topup-email/route.ts");
  assert.match(topup, /maxRequests: 3, windowMs: 24 \* 60 \* 60_000/);
  assert.match(topup, /creditsUrlFor\(user\.role\)/);
  assert.doesNotMatch(topup, /naira|₦|packKobo|checkout|initializePaystack/i);
});
