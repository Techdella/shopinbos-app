// The Expo app's supplier, delivery partner and rider sides (apps/mobile/src/app/{supplier,logistics,rider}) and
// the routes made for them (src/app/api/mobile/{supplier,logistics}). Pure helpers are loaded directly (Node
// strips the types); the routes are checked for their role guard.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const pure = await import("../apps/mobile/src/lib/partner-pure.ts");
const rules = await import("../src/app/api/mobile/supplier/_rules.ts");

test("each role lands on its own tab group", () => {
  assert.equal(pure.homeFor("seller"), "/home");
  assert.equal(pure.homeFor("supplier"), "/supplier/home");
  assert.equal(pure.homeFor("logistics_partner"), "/logistics/home");
  assert.equal(pure.homeFor("admin"), "/web-only");
  assert.equal(pure.asRole("logistics_partner"), "logistics_partner");
  assert.equal(pure.asRole("superuser"), null);
  assert.equal(pure.asSignupRole("admin"), "seller");
  assert.equal(pure.asSignupRole("supplier"), "supplier");
});

test("wrong-role screens can't be visited", () => {
  const cases = [
    ["seller", "/home", true],
    ["seller", "/order/abc", true],
    ["seller", "/supplier/home", false],
    ["seller", "/logistics/job/1", false],
    ["supplier", "/supplier/orders", true],
    ["supplier", "/supplier/order/abc?kind=dropship", true],
    ["supplier", "/home", false],
    ["supplier", "/find", false],
    ["supplier", "/logistics/home", false],
    // The Delivery hub is shared by sellers and suppliers (same /api/mobile/delivery routes).
    ["supplier", "/delivery", true],
    ["supplier", "/delivery/partner/swift", true],
    ["supplier", "/deliveryx", false],
    ["seller", "/delivery/find", true],
    ["logistics_partner", "/delivery", false],
    ["logistics_partner", "/logistics/riders", true],
    ["logistics_partner", "/supplier/home", false],
    ["logistics_partner", "/chats", false],
    ["admin", "/home", false],
    ["admin", "/web-only", true],
    [null, "/home", false],
    [null, "/supplier/home", false],
    [null, "/welcome", true],
    [null, "/signup", true],
    [null, "/auth/callback", true],
    [null, "/rider", true],
    [null, "/rider/link", true],
    // The shared "Familiar app" screens (Rewards, Ask Peggy, Create with Rex, the posts calendar, a new status)
    // are for every business role, not for admins or anyone signed out.
    ...["/rewards", "/ask-peggy", "/create", "/create/job_1", "/posts", "/posts/post_1", "/status/new"].flatMap((path) => [
      ["seller", path, true],
      ["supplier", path, true],
      ["logistics_partner", path, true],
      ["admin", path, false],
      [null, path, false],
    ]),
    ["supplier", "/postsx", false],
    ["supplier", "/peggy", false],
  ];
  for (const [role, path, allowed] of cases) assert.equal(pure.canVisit(role, path), allowed, `${role} → ${path}`);
  assert.equal(pure.areaOf("/supplier"), "supplier");
  assert.equal(pure.areaOf("/suppliers-near-me"), "seller");
});

test("rider links: full URL, app link or bare token", () => {
  const token = "A".repeat(20) + "b_-" + "9".repeat(20);
  assert.equal(token.length, 43);
  assert.equal(pure.parseRiderToken(`https://app.shopinbos.com/rider/${token}`), token);
  assert.equal(pure.parseRiderToken(`shopinbos://rider/${token}?x=1`), token);
  assert.equal(pure.parseRiderToken(`  ${token} `), token);
  assert.equal(pure.parseRiderToken("https://app.shopinbos.com/rider/short"), null);
  assert.equal(pure.parseRiderToken(`https://app.shopinbos.com/rider/${token}extra`), null);
  assert.equal(pure.parseRiderToken(""), null);
});

test("job pipeline steps match the server's job rules", async () => {
  const jobRules = await import("../src/lib/logistics/job-rules.ts").catch(() => null);
  for (const status of ["pending", "confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed", "returning", "returned", "declined", "cancelled"]) {
    for (const step of pure.jobNextSteps(status)) {
      if (jobRules) assert.ok(jobRules.canMove(status, step.to), `${status} → ${step.to}`);
    }
    if (pure.canFail(status) && jobRules) assert.ok(jobRules.canMove(status, "failed"), `${status} → failed`);
  }
  assert.deepEqual(pure.jobNextSteps("picked_up").map((step) => step.to), ["in_transit", "delivered"]);
  assert.deepEqual(pure.jobNextSteps("delivered"), []);
  assert.equal(pure.jobStage("in_transit").label, "On the way");
});

test("supplier order actions: dropship accept → handed over → delivered (or decline); wholesale adds packing", () => {
  // Dropship orders are SupplierOrder rows: only the supplier's own lines, so another product on the shop's order
  // no longer blocks them (src/lib/supplier-orders).
  assert.deepEqual(rules.nextActions("dropship", "pending"), ["accept", "decline"]);
  assert.equal(rules.statusAfter("dropship", "pending", "accept"), "accepted");
  assert.equal(rules.statusAfter("dropship", "pending", "decline"), "rejected");
  assert.equal(rules.statusAfter("dropship", "accepted", "handed_over"), "shipped");
  assert.equal(rules.statusAfter("dropship", "shipped", "delivered"), "delivered");
  assert.equal(rules.statusAfter("dropship", "pending", "handed_over"), null);
  assert.equal(rules.statusAfter("dropship", "accepted", "packed"), null);
  assert.deepEqual(rules.nextActions("dropship", "delivered"), []);
  assert.deepEqual(rules.nextActions("dropship", "rejected"), []);

  assert.deepEqual(rules.nextActions("wholesale", "pending"), ["accept", "decline"]);
  assert.equal(rules.statusAfter("wholesale", "pending", "decline"), "cancelled");
  assert.equal(rules.statusAfter("wholesale", "pending", "accept"), "confirmed");
  assert.equal(rules.statusAfter("wholesale", "confirmed", "packed"), "processing");
  assert.equal(rules.statusAfter("wholesale", "processing", "handed_over"), "shipped");
  assert.equal(rules.statusAfter("wholesale", "shipped", "delivered"), "delivered");
  assert.equal(rules.statusAfter("wholesale", "delivered", "accept"), null);
});

test("dropship order lists: open is to accept or send, done is sent, delivered or closed", () => {
  assert.deepEqual([...rules.DROPSHIP_OPEN], ["pending", "accepted"]);
  assert.deepEqual([...rules.DROPSHIP_DONE], ["shipped", "delivered", "rejected", "cancelled", "expired"]);
  assert.ok(rules.needsSupplier("dropship", "pending"));
  assert.ok(rules.needsSupplier("dropship", "accepted"));
  assert.ok(!rules.needsSupplier("dropship", "shipped"), "marking delivered isn't urgent");
});

test("quote replies carry the minimum order; low stock and money parsing", () => {
  assert.equal(rules.quoteReplyText("Ships in 3 days", 50), "Ships in 3 days\nMinimum order: 50 units.");
  assert.equal(rules.quoteReplyText("", 1), undefined);
  assert.equal(rules.quoteReplyText(null, 20), "Minimum order: 20 units.");
  assert.ok(rules.isLowStock({ stockQuantity: 3, status: "published" }));
  assert.ok(!rules.isLowStock({ stockQuantity: 3, status: "unpublished" }));
  assert.ok(!rules.isLowStock({ stockQuantity: 40, status: "published" }));
  assert.equal(pure.parseAmount("₦12,500"), 12500);
  assert.equal(pure.parseAmount("0"), null);
  assert.equal(pure.parseCount("1,200"), 1200);
  assert.equal(pure.parseCount("2.5"), null);
  assert.equal(pure.shortPlace("14 Herbert Macaulay Way, Yaba"), "Yaba");
});

function routeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...routeFiles(path));
    else if (name === "route.ts") out.push(path);
  }
  return out;
}

test("partner app routes check the role (riders check their link)", () => {
  const root = new URL("../src/app/api/mobile/", import.meta.url).pathname;
  for (const file of routeFiles(join(root, "supplier"))) assert.match(readFileSync(file, "utf8"), /withSupplier\(/, file);
  for (const file of routeFiles(join(root, "logistics"))) {
    const source = readFileSync(file, "utf8");
    if (file.includes(`${join("logistics", "rider")}/`)) assert.match(source, /riderFromToken|setRiderOnline/, file);
    else assert.match(source, /withLogistics\(/, file);
  }
});

test("each partner tab group has its screens", () => {
  const app = new URL("../apps/mobile/src/app/", import.meta.url).pathname;
  for (const name of ["home", "orders", "products", "quotes", "messages", "more"]) assert.ok(existsSync(join(app, "supplier/(tabs)", `${name}.tsx`)), `supplier ${name}`);
  for (const name of ["home", "jobs", "riders", "earnings", "messages", "more"]) assert.ok(existsSync(join(app, "logistics/(tabs)", `${name}.tsx`)), `logistics ${name}`);
  for (const name of ["(tabs)/index", "(tabs)/earnings", "(tabs)/me", "job", "sign-in", "link", "[token]", "drop/[id]"]) assert.ok(existsSync(join(app, "rider", `${name}.tsx`)), `rider ${name}`);
  assert.match(readFileSync(join(app, "_layout.tsx"), "utf8"), /<RoleGuard \/>/);
});
