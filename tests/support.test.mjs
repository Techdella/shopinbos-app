// Live support (Stuck? form, in-app chat, admin support desk): pure helpers (Node strips the types natively).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const s = await import("../src/lib/support/pure.ts");

test("ticket numbers read SB-1042 and parse back from any reasonable spelling", () => {
  assert.equal(s.formatTicketNumber(1042), "SB-1042");
  for (const raw of ["SB-1042", "sb-1042", "sb1042", "#SB-1042", "1042", " 1042 ", 1042]) assert.equal(s.parseTicketNumber(raw), 1042, String(raw));
  for (const raw of ["", "SB-", "SB-12a", "abc", "-5", "0", null, undefined, "1.5"]) assert.equal(s.parseTicketNumber(raw), null, String(raw));
});

test("reply emails find their ticket by plus-address first, then the subject tag", () => {
  assert.equal(s.ticketNumberFromEmail({ to: ["support+sb-1042@shopinbos.com"], subject: "hello" }), 1042);
  assert.equal(s.ticketNumberFromEmail({ to: ["support@shopinbos.com"], subject: "Re: [SB-1043] Payout late" }), 1043);
  assert.equal(s.ticketNumberFromEmail({ to: ["support@shopinbos.com"], subject: "Payout late" }), null);
  assert.equal(s.replyAddress("support@shopinbos.com", 1042), "support+sb-1042@shopinbos.com");
  assert.equal(s.addressedToSupport(["Support+SB-1@Shopinbos.com"], "support@shopinbos.com"), true);
  assert.equal(s.addressedToSupport(["kofi-kitchen@shopinbos.com"], "support@shopinbos.com"), false);
  assert.equal(s.addressedToSupport(["support@other.com"], "support@shopinbos.com"), false);
});

test("quoted history is cut from emailed replies", () => {
  const gmail = "Thanks, that worked!\n\nOn Mon, 12 Oct 2026 at 10:00, Shopinbos <support@shopinbos.com> wrote:\n> Hi Ada,\n> Try again.";
  assert.equal(s.stripQuotedReply(gmail), "Thanks, that worked!");
  const wrapped = "Still broken\n\nOn Mon, 12 Oct 2026 at 10:00, Shopinbos Support\n<support@shopinbos.com> wrote:\n> old";
  assert.equal(s.stripQuotedReply(wrapped), "Still broken");
  assert.equal(s.stripQuotedReply("New text\n-----Original Message-----\nFrom: x"), "New text");
  // Inline quotes followed by an answer are kept as the answer.
  assert.equal(s.stripQuotedReply("> what's your order?\nIt's #1001"), "It's #1001");
});

test("spam: honeypot, too-fast forms and link farms are caught; people are not", () => {
  const now = 1_000_000;
  assert.equal(s.looksLikeSpam({ honeypot: "http://spam", startedAt: now - 60_000, now }), true);
  assert.equal(s.looksLikeSpam({ honeypot: "", startedAt: now - 500, now }), true);
  assert.equal(s.looksLikeSpam({ honeypot: "", startedAt: now - 60_000, now, message: "a https://1 https://2 https://3 https://4" }), true);
  assert.equal(s.looksLikeSpam({ honeypot: "", startedAt: now - 60_000, now, message: "I can't log in. See https://shopinbos.com/login" }), false);
  assert.equal(s.looksLikeSpam({ startedAt: undefined, now, message: "Help" }), false);
});

test("public form needs a name, an email or phone, a topic and a real message", () => {
  const good = { name: "Ada", contact: "ada@shop.ng", topic: "login", message: "I can't log in" };
  assert.equal(s.publicRequestSchema.safeParse(good).success, true);
  assert.equal(s.publicRequestSchema.safeParse({ ...good, contact: "0803 123 4567" }).success, true);
  assert.equal(s.publicRequestSchema.safeParse({ ...good, contact: "not a contact" }).success, false);
  assert.equal(s.publicRequestSchema.safeParse({ ...good, topic: "refund" }).success, false);
  assert.equal(s.publicRequestSchema.safeParse({ ...good, message: "hi" }).success, false);
  assert.deepEqual(s.splitContact(" Ada@Shop.NG "), { email: "ada@shop.ng", phone: null });
  assert.deepEqual(s.splitContact("0803 123 4567"), { email: null, phone: "+2348031234567" });
  assert.deepEqual(s.splitContact("+233 24 123 4567"), { email: null, phone: "+233241234567" });
});

test("files: screenshots and PDFs up to 10 MB, stored only under the ticket's folder", () => {
  assert.equal(s.attachmentProblem({ type: "image/png", size: 2000 }), null);
  assert.match(s.attachmentProblem({ type: "application/zip", size: 2000 }), /screenshot/);
  assert.match(s.attachmentProblem({ type: "image/png", size: 11 * 1024 * 1024 }), /10 MB/);
  // WhatsApp files: any kind, up to 50 MB; anything a browser would run is kept as a download.
  for (const type of ["audio/ogg", "video/mp4", "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) assert.equal(s.whatsappAttachmentProblem({ type, size: 20 * 1024 * 1024 }), null, type);
  assert.match(s.whatsappAttachmentProblem({ size: 51 * 1024 * 1024 }), /50 MB/);
  assert.match(s.whatsappAttachmentProblem({ size: 0 }), /empty/);
  assert.equal(s.whatsappStoredType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(s.whatsappStoredType("text/html"), "application/octet-stream");
  assert.equal(s.whatsappStoredType("image/svg+xml"), "application/octet-stream");
  assert.equal(s.whatsappStoredType(""), "application/octet-stream");
  assert.equal(s.attachmentPathBelongs("support/t1/123-abc.png", "t1"), true);
  assert.equal(s.attachmentPathBelongs("support/t2/123-abc.png", "t1"), false);
  assert.equal(s.attachmentPathBelongs("support/t1/../t2/x.png", "t1"), false);
  assert.deepEqual(s.asAttachments([{ path: "support/t1/a.png", name: "a.png", type: "image/png", size: 3 }, { nope: true }, null]), [{ path: "support/t1/a.png", name: "a.png", type: "image/png", size: 3 }]);
  assert.equal(s.safeFileName('a/b:c?.png'), "a-b-c-.png");
});

test("SLA: login and payments start high; due times and states follow priority", () => {
  assert.equal(s.defaultPriority("login"), "high");
  assert.equal(s.defaultPriority("payments"), "high");
  assert.equal(s.defaultPriority("store"), "normal");
  const created = new Date("2026-10-12T09:00:00Z");
  assert.equal(s.firstResponseDue(created, "normal").toISOString(), "2026-10-12T10:00:00.000Z");
  assert.equal(s.firstResponseDue(created, "urgent").toISOString(), "2026-10-12T09:15:00.000Z");
  const due = "2026-10-12T10:00:00Z";
  const at = (iso) => new Date(iso).getTime();
  assert.deepEqual(s.slaState({ firstResponseDueAt: due, firstRespondedAt: null, status: "open" }, at("2026-10-12T09:30:00Z")), { state: "ok", minutes: 30 });
  assert.deepEqual(s.slaState({ firstResponseDueAt: due, firstRespondedAt: null, status: "open" }, at("2026-10-12T09:55:00Z")), { state: "soon", minutes: 5 });
  assert.deepEqual(s.slaState({ firstResponseDueAt: due, firstRespondedAt: null, status: "open" }, at("2026-10-12T10:20:00Z")), { state: "overdue", minutes: 20 });
  assert.equal(s.slaState({ firstResponseDueAt: due, firstRespondedAt: "2026-10-12T09:10:00Z", status: "pending" }).state, "met");
  assert.equal(s.slaState({ firstResponseDueAt: due, firstRespondedAt: null, status: "solved" }).state, "none");
  assert.equal(s.formatMinutes(45), "45m");
  assert.equal(s.formatMinutes(90), "1h 30m");
  assert.equal(s.formatMinutes(60 * 72), "3d");
});

test("stats: median first response and CSAT (share of 4-5 ratings)", () => {
  assert.equal(s.median([]), null);
  assert.equal(s.median([30, 10, 20]), 20);
  assert.equal(s.median([10, 20, 30, 40]), 25);
  assert.deepEqual(s.csat([5, 4, 2, 5]), { score: 75, average: 4, count: 4 });
  assert.deepEqual(s.csat([]), { score: null, average: null, count: 0 });
});

test("unread: an agent reply after the customer last looked", () => {
  assert.equal(s.hasUnread(null, null), false);
  assert.equal(s.hasUnread("2026-10-12T10:00:00Z", null), true);
  assert.equal(s.hasUnread("2026-10-12T10:00:00Z", "2026-10-12T09:00:00Z"), true);
  assert.equal(s.hasUnread("2026-10-12T10:00:00Z", "2026-10-12T10:05:00Z"), false);
});

test("saved replies fill names, ticket and agent; unknown tags stay as written", () => {
  const body = "Hi {{first_name}}, about {{ticket}} — {{agent}} ({{ name }}). {{unknown}}";
  assert.equal(s.fillMacro(body, { name: "Ada Obi", ticket: 1042, agent: "Tunde Bello" }), "Hi Ada, about SB-1042 — Tunde (Ada Obi). {{unknown}}");
  assert.equal(s.fillMacro("Hi {{first_name}}", { name: "" }), "Hi there");
});

test("agent and bulk updates validate; ticket text is cleaned and capped", () => {
  assert.equal(s.ticketUpdateSchema.safeParse({}).success, false);
  assert.equal(s.ticketUpdateSchema.safeParse({ status: "solved" }).success, true);
  assert.equal(s.ticketUpdateSchema.safeParse({ assigneeId: null }).success, true);
  assert.equal(s.ticketUpdateSchema.safeParse({ priority: "panic" }).success, false);
  assert.equal(s.bulkUpdateSchema.safeParse({ ids: [], status: "solved" }).success, false);
  assert.equal(s.agentReplySchema.parse({ message: "hi" }).internal, false);
  assert.equal(s.ratingSchema.safeParse({ rating: 6 }).success, false);
  assert.equal(s.sanitizeText("  Hi\r\nthere ​\u0007 "), "Hi\nthere");
  assert.equal(s.sanitizeText("x".repeat(s.MESSAGE_MAX + 10)).length, s.MESSAGE_MAX);
  assert.equal(s.escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(s.subjectFrom("orders", "\n\nOrder #1001 never arrived\nmore"), "Order #1001 never arrived");
  assert.equal(s.subjectFrom("orders", "   "), "Orders");
});

test("wiring: Stuck? opens the panel, the migration enables RLS, admins get a Support link", () => {
  const auth = readFileSync(new URL("../src/components/auth/app/AppAuth.tsx", import.meta.url), "utf8");
  // "Need help?" in the sign-in header opens the support panel when no WhatsApp line is set; the password
  // screens' "Stuck?" card does too, with the small email fallback link.
  const help = auth.slice(auth.indexOf("function HelpLink"), auth.indexOf("export function StuckLink"));
  assert.match(help, /SupportRequestPanel/);
  assert.match(help, /<button/);
  const card = auth.slice(auth.indexOf("export function StuckLink"));
  assert.match(card, /SupportRequestPanel/);
  assert.match(card, /<button/);
  assert.match(card, /mailto:support@shopinbos\.com/, "keeps the small email fallback link");

  const sql = readFileSync(new URL("../docs/migrations/2026-10-12-support.sql", import.meta.url), "utf8");
  for (const table of ["SupportTicket", "SupportMessage", "SupportMacro"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.doesNotMatch(sql, /DROP |ALTER TABLE "User"/i, "additive only");

  const nav = readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8");
  assert.match(nav, /href: "\/admin\/support"/);
  for (const route of ["src/app/api/support/requests/route.ts", "src/app/api/support/inbound/route.ts", "src/app/api/admin/support/tickets/route.ts", "src/app/admin/support/page.tsx"]) {
    assert.ok(existsSync(new URL(`../${route}`, import.meta.url)), route);
  }
  // Every admin support route is admin-only.
  for (const route of ["tickets/route.ts", "tickets/bulk/route.ts", "tickets/[id]/route.ts", "tickets/[id]/messages/route.ts", "macros/route.ts", "macros/[id]/route.ts", "stats/route.ts"]) {
    const source = readFileSync(new URL(`../src/app/api/admin/support/${route}`, import.meta.url), "utf8");
    assert.match(source, /withAdmin\(/, route);
    assert.doesNotMatch(source, /withAuth\(/, route);
  }
});
