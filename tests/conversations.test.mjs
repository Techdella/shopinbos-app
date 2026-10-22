// Partner messages (seller ↔ supplier ↔ delivery partner): pure helpers (Node strips the types natively).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = await import("../src/lib/conversations/pure.ts");

test("only B2B pairs can message: seller↔supplier, seller↔delivery, supplier↔delivery", () => {
  assert.equal(m.canMessage("seller", "supplier"), true);
  assert.equal(m.canMessage("supplier", "seller"), true);
  assert.equal(m.canMessage("seller", "logistics_partner"), true);
  assert.equal(m.canMessage("logistics_partner", "supplier"), true);
  assert.equal(m.canMessage("seller", "seller"), false);
  assert.equal(m.canMessage("admin", "seller"), false);
  assert.equal(m.canMessage(undefined, "seller"), false);
  assert.deepEqual(m.orderedPair("b", "a"), ["a", "b"]);
  assert.deepEqual(m.orderedPair("a", "b"), ["a", "b"]);
});

test("message text is cleaned: no control or invisible characters, normalised newlines, capped", () => {
  assert.equal(m.sanitizeMessageText("  Hi\r\nthere ​‮\u0007 "), "Hi\nthere");
  assert.equal(m.sanitizeMessageText("a\n\n\n\n\nb"), "a\n\nb");
  assert.equal(m.sanitizeMessageText("tab\tkept"), "tab\tkept");
  assert.equal(m.sanitizeMessageText(42), "");
  assert.equal(m.sanitizeMessageText("x".repeat(m.MESSAGE_MAX + 50)).length, m.MESSAGE_MAX);
  assert.equal(m.escapeHtml(`<b onclick="x">'&'</b>`), "&lt;b onclick=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
});

test("send schema: needs text, a file or a card; validates files and cards", () => {
  assert.equal(m.sendMessageSchema.safeParse({ text: "   " }).success, false);
  assert.equal(m.sendMessageSchema.safeParse({}).success, false);
  const ok = m.sendMessageSchema.parse({ text: " Is this in stock? " });
  assert.equal(ok.text, "Is this in stock?");
  assert.deepEqual(ok.attachments, []);
  assert.equal(m.sendMessageSchema.safeParse({ context: { kind: "product", id: "p1" } }).success, true);
  assert.equal(m.sendMessageSchema.safeParse({ context: { kind: "invoice", id: "p1" } }).success, false);
  const file = { path: "messages/c1/1-a.pdf", name: "Price list.pdf", type: "application/pdf", size: 2048 };
  assert.equal(m.sendMessageSchema.safeParse({ attachments: [file] }).success, true);
  assert.equal(m.sendMessageSchema.safeParse({ attachments: [{ ...file, type: "text/html" }] }).success, false);
  assert.equal(m.sendMessageSchema.safeParse({ attachments: [{ ...file, size: m.MAX_ATTACHMENT_BYTES + 1 }] }).success, false);
  assert.equal(m.sendMessageSchema.safeParse({ attachments: Array(m.MAX_ATTACHMENTS + 1).fill(file) }).success, false);
  assert.equal(m.sendMessageSchema.parse({ attachments: [{ ...file, name: "../../evil<x>.pdf" }] }).attachments[0].name, "..-..-evil-x-.pdf");
});

test("files: only photos and PDFs up to 4 MB (shrunk first), and only from this conversation's folder", () => {
  assert.equal(m.attachmentProblem({ type: "image/png", size: 1000 }), null);
  assert.match(m.attachmentProblem({ type: "application/zip", size: 1000 }), /photo/);
  assert.match(m.attachmentProblem({ type: "application/pdf", size: 5 * 1024 * 1024 }), /4 MB/);
  assert.match(m.attachmentProblem({ type: "image/png", size: 0 }), /empty/);
  assert.equal(m.attachmentPathBelongs("messages/c1/1.png", "c1"), true);
  assert.equal(m.attachmentPathBelongs("messages/c2/1.png", "c1"), false);
  assert.equal(m.attachmentPathBelongs("messages/c1/../c2/1.png", "c1"), false);
  assert.equal(m.attachmentPathBelongs("brand/1.png", "c1"), false);
  assert.equal(m.formatBytes(2048), "2 KB");
  assert.equal(m.formatBytes(3 * 1024 * 1024), "3.0 MB");
});

test("previews describe files and cards when there's no text", () => {
  assert.equal(m.messagePreview({ text: "  Hello\n there " }), "Hello there");
  assert.equal(m.messagePreview({ text: "", attachments: [{ type: "image/png" }] }), "Sent a photo");
  assert.equal(m.messagePreview({ text: "", attachments: [{ type: "image/png" }, { type: "image/jpeg" }] }), "Sent 2 photos");
  assert.equal(m.messagePreview({ text: "", attachments: [{ type: "application/pdf" }] }), "Sent a PDF");
  assert.equal(m.messagePreview({ text: "", context: { kind: "product", label: "Ankara fabric" } }), "Shared a product: Ankara fabric");
  assert.equal(m.messagePreview({ text: "x".repeat(200) }).length, 138);
});

test("day separators: grouping and labels", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  // 23:30 UTC on the 11th is 00:30 on the 12th in Lagos (UTC+1).
  assert.equal(m.dayKey("2026-10-11T23:30:00Z"), "2026-10-12");
  assert.equal(m.dayLabel("2026-10-11T12:00:00Z", now), "Yesterday");
  assert.match(m.dayLabel("2026-10-05T12:00:00Z", now), /Mon,? 5 Oct/);
  assert.match(m.dayLabel("2025-10-05T12:00:00Z", now), /2025/);
  const groups = m.groupByDay(
    [
      { id: "1", createdAt: "2026-10-11T12:00:00Z" },
      { id: "2", createdAt: "2026-10-11T13:00:00Z" },
      { id: "3", createdAt: "2026-10-12T09:00:00Z" },
    ],
    now,
  );
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [["Yesterday", 2], ["Today", 1]]);
});

test("list filters by tab and search; merging polls dedupes and orders; Seen marks the latest read", () => {
  const items = [
    { with: { name: "Ada Fabrics", role: "supplier" }, lastMessage: { text: "In stock" } },
    { with: { name: "Swift Riders", role: "logistics_partner" }, lastMessage: { text: "Rider on the way" } },
    { with: { name: "Kemi Store", role: "seller" }, lastMessage: null },
  ];
  assert.equal(m.filterConversations(items, "all").length, 3);
  assert.deepEqual(m.filterConversations(items, "supplier").map((i) => i.with.name), ["Ada Fabrics"]);
  assert.deepEqual(m.filterConversations(items, "all", "rider").map((i) => i.with.name), ["Swift Riders"]);
  assert.deepEqual(m.filterConversations(items, "all", "KEMI").map((i) => i.with.name), ["Kemi Store"]);

  const merged = m.mergeMessages(
    [{ id: "a", createdAt: "2026-10-12T09:00:00Z", text: "old" }, { id: "b", createdAt: "2026-10-12T09:01:00Z", text: "b" }],
    [{ id: "a", createdAt: "2026-10-12T09:00:00Z", text: "new" }, { id: "c", createdAt: "2026-10-12T08:59:00Z", text: "c" }],
  );
  assert.deepEqual(merged.map((x) => `${x.id}:${x.text}`), ["c:c", "a:new", "b:b"]);

  assert.equal(m.lastSeenId([{ id: "1", mine: true, read: true }, { id: "2", mine: false, read: true }, { id: "3", mine: true, read: false }]), "1");
  assert.equal(m.lastSeenId([{ id: "1", mine: false, read: true }]), null);
});

test("unread email waits the delay, goes once, and gives up after three days", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const at = (minutes) => new Date(now.getTime() - minutes * 60_000);
  assert.equal(m.shouldEmailUnread({ createdAt: at(m.UNREAD_EMAIL_DELAY_MINUTES + 1), read: false, emailedAt: null }, now), true);
  assert.equal(m.shouldEmailUnread({ createdAt: at(2), read: false, emailedAt: null }, now), false);
  assert.equal(m.shouldEmailUnread({ createdAt: at(60), read: true, emailedAt: null }, now), false);
  assert.equal(m.shouldEmailUnread({ createdAt: at(60), read: false, emailedAt: now }, now), false);
  assert.equal(m.shouldEmailUnread({ createdAt: at(4 * 24 * 60), read: false, emailedAt: null }, now), false);
});

test("links: per-portal messages page, context param round-trips, cards link where the viewer can go", () => {
  assert.equal(m.messagesHref("seller", { with: "sup1", context: { kind: "product", id: "p9" } }), "/home/messages/partners?with=sup1&ctx=product%3Ap9");
  assert.equal(m.messagesHref("supplier", { conversation: "c1" }), "/supplier/inbox?c=c1");
  assert.equal(m.messagesHref("logistics_partner"), "/logistics/inbox");
  assert.deepEqual(m.parseContextParam("booking:b1"), { kind: "booking", id: "b1" });
  assert.equal(m.parseContextParam("nope:b1"), null);
  assert.equal(m.parseContextParam(":b1"), null);
  assert.equal(m.parseContextParam(null), null);
  const product = { kind: "product", id: "p1", label: "Bag", slug: "bag" };
  assert.equal(m.contextHref("seller", product), "/marketplace/product/bag");
  assert.equal(m.contextHref("supplier", product), "/supplier/products/p1/edit");
  assert.equal(m.contextHref("logistics_partner", { kind: "order", id: "o1", label: "Order 12" }), null);
  assert.equal(m.contextHref("seller", { kind: "order", id: "o1", label: "Order 12" }), "/home/orders/o1");
});

test("quick replies fit who's talking", () => {
  assert.ok(m.quickReplies("seller", "supplier").includes("Is this in stock?"));
  assert.ok(m.quickReplies("seller", "supplier").includes("Can you do a better price for 50 units?"));
  assert.ok(m.quickReplies("seller", "logistics_partner").includes("When will the rider pick up?"));
  assert.deepEqual(m.quickReplies("admin", "seller"), []);
  assert.equal(m.roleLabel("logistics_partner"), "Delivery partner");
  assert.equal(m.formatMoney(12500), "₦12,500");
  assert.equal(m.statusLabel("in_transit"), "In transit");
});

test("migration is additive, idempotent and turns RLS on", () => {
  const sql = readFileSync(new URL("../docs/migrations/2026-10-12-partner-messages.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "MessageDetail"/);
  assert.match(sql, /ALTER TABLE "MessageDetail" ENABLE ROW LEVEL SECURITY/);
  for (const index of sql.match(/CREATE (UNIQUE )?INDEX[^\n]*/g) ?? []) assert.match(index, /IF NOT EXISTS/);
});

test("off-app note: only in chats with a delivery partner, never a block", () => {
  const partnerChat = ["seller", "logistics_partner"];
  assert.match(m.offPlatformNote("Call me on 08031234567", partnerChat) ?? "", /Keep jobs and payments in Shopinbos/);
  assert.ok(m.offPlatformNote("Just pay me directly, transfer to my account", partnerChat));
  assert.ok(m.offPlatformNote("email me at ade@example.com", ["logistics_partner", "supplier"]));
  assert.equal(m.offPlatformNote("The rider is on the way.", partnerChat), null);
  assert.equal(m.offPlatformNote("Call me on 08031234567", ["seller", "supplier"]), null);
  assert.equal(m.offPlatformNote("", partnerChat), null);
});
