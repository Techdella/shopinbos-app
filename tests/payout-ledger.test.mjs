// The payout and rewards ledger (Admin › Payouts, shared/payout-ledger.ts): Friday paydays in Lagos time, the
// idempotent resell sync (approved → owed, voided → void), carry-over, grouping by earner with the per-shop
// breakdown, admin input checks, the CSV; plus the wiring (migration, schema, admin page, actions, logs, the
// earner's totals on /resell and the phone, sidebar and nav keys).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pl = await import("../shared/payout-ledger.ts");
const team = await import("../src/lib/admin-team/pure.ts");
const nav = await import("../src/lib/nav.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("paydays are Fridays, Lagos time; a closed Friday moves the open list to the next one", () => {
  // Wed 4 Nov 2026 → Friday 6 Nov.
  assert.equal(pl.paydayFor(new Date("2026-11-04T10:00:00Z")), "2026-11-06");
  // Friday itself (Lagos) is that Friday's list, from just after midnight Lagos (23:30 UTC Thursday).
  assert.equal(pl.paydayFor(new Date("2026-11-05T23:30:00Z")), "2026-11-06");
  assert.equal(pl.paydayFor(new Date("2026-11-05T22:30:00Z")), "2026-11-06", "Thursday 23:30 Lagos: this coming Friday");
  assert.equal(pl.paydayFor(new Date("2026-11-06T22:59:00Z")), "2026-11-06", "Friday 23:59 Lagos");
  assert.equal(pl.paydayFor(new Date("2026-11-06T23:00:00Z")), "2026-11-13", "Saturday 00:00 Lagos is next Friday's");
  assert.equal(pl.currentPayday(new Date("2026-11-06T12:00:00Z"), []), "2026-11-06");
  assert.equal(pl.currentPayday(new Date("2026-11-06T12:00:00Z"), ["2026-11-06"]), "2026-11-13", "this Friday's list was closed");
  assert.equal(pl.isFriday("2026-11-06"), true);
  assert.equal(pl.isFriday("2026-11-07"), false);
  assert.equal(pl.isFriday("2026-02-30"), false);
  assert.equal(pl.cleanPayday("2026-11-13"), "2026-11-13");
  assert.equal(pl.cleanPayday("2026-11-12"), null);
  assert.equal(pl.cleanPayday(undefined), null);
  assert.equal(pl.addDays("2026-12-25", 7), "2027-01-01");
});

test("sync: approved sales become owed lines once; voided sales void owed lines; pending waits", () => {
  const sales = [
    { id: "s1", storeId: "st1", resellerUserId: "u1", commissionAmount: 1500, status: "approved" },
    { id: "s2", storeId: "st1", resellerUserId: "u1", commissionAmount: 900, status: "pending" },
    { id: "s3", storeId: "st2", resellerUserId: "u2", commissionAmount: 700, status: "void" },
    { id: "s4", storeId: "st2", resellerUserId: "u2", commissionAmount: 0, status: "approved" },
    { id: "s5", storeId: "st2", resellerUserId: "u2", commissionAmount: 300, status: "paid" },
  ];
  const first = pl.planResellSync(sales, []);
  assert.deepEqual(first.create, [{ earnerUserId: "u1", sourceKind: "resell", sourceId: "s1", storeId: "st1", amount: 1500 }]);
  assert.deepEqual(first.voidLineIds, []);
  // Running again with the line in place makes nothing new (idempotent).
  const lines = [{ id: "l1", sourceKind: "resell", sourceId: "s1", status: "owed" }];
  assert.deepEqual(pl.planResellSync(sales, lines), { create: [], voidLineIds: [] });
  // The order was refunded after delivery: the owed line is voided, a paid one is left alone.
  const refunded = sales.map((sale) => (sale.id === "s1" ? { ...sale, status: "void" } : sale));
  assert.deepEqual(pl.planResellSync(refunded, lines).voidLineIds, ["l1"]);
  assert.deepEqual(pl.planResellSync(refunded, [{ ...lines[0], status: "paid" }]).voidLineIds, []);
  // Lines of another kind with the same id never match.
  assert.equal(pl.planResellSync(sales, [{ id: "x", sourceKind: "creator_brief", sourceId: "s1", status: "owed" }]).create.length, 1);
});

test("carry-over: owed lines not on the open list move to it; paid and void stay where they were", () => {
  const lines = [
    { id: "a", status: "owed", batchPayday: "2026-10-30" },
    { id: "b", status: "owed", batchPayday: null },
    { id: "c", status: "owed", batchPayday: "2026-11-06" },
    { id: "d", status: "paid", batchPayday: "2026-10-30" },
    { id: "e", status: "void", batchPayday: "2026-10-30" },
  ];
  assert.deepEqual(pl.linesToCarry(lines, "2026-11-06"), ["a", "b"]);
});

test("grouping: per earner, per shop that owes it; void counts for nothing; most owed first", () => {
  const line = (id, earnerUserId, storeId, amount, status, sourceKind = "resell") => ({ id, earnerUserId, storeId, amount, status, sourceKind, sourceId: id, method: null, reference: null, note: null, phone: null, network: null, paidAt: null, createdAt: `2026-11-0${id.length}T00:00:00Z` });
  const groups = pl.groupByEarner([
    line("a", "u1", "st1", 1000, "owed"),
    line("b", "u1", "st2", 500, "owed"),
    line("c", "u1", "st1", 200, "paid"),
    line("d", "u2", null, 300, "owed", "airtime_reward"),
    line("e", "u2", "st1", 9000, "void"),
  ]);
  assert.deepEqual(groups.map((group) => [group.earnerUserId, group.owed, group.paid]), [["u1", 1500, 200], ["u2", 300, 0]]);
  const u1 = groups[0];
  assert.deepEqual(u1.shops.map((shop) => [shop.storeId, shop.owed, shop.paid, shop.owedLineIds]), [["st1", 1000, 200, ["a"]], ["st2", 500, 0, ["b"]]]);
  assert.deepEqual(groups[1].shops.map((shop) => shop.storeId), [null, "st1"]);
  assert.deepEqual(pl.ledgerTotals(groups.flatMap((group) => group.lines)), { owed: 1800, paid: 200, void: 9000, lines: 5 });
});

test("the earner's own totals: owed, paid, airtime, last paid", () => {
  const summary = pl.earnerSummary([
    { amount: 1000, status: "owed", sourceKind: "resell", paidAt: null },
    { amount: 400, status: "paid", sourceKind: "resell", paidAt: "2026-10-30T12:00:00Z" },
    { amount: 200, status: "paid", sourceKind: "airtime_reward", paidAt: "2026-11-06T12:00:00Z" },
    { amount: 999, status: "void", sourceKind: "resell", paidAt: null },
  ]);
  assert.deepEqual(summary, { owed: 1000, paid: 600, airtime: 200, lastPaidAt: "2026-11-06T12:00:00Z" });
});

test("admin input: phone numbers, amounts, mark-paid and reward checks", () => {
  assert.equal(pl.cleanAirtimePhone("0803 412 7790"), "+2348034127790");
  assert.equal(pl.cleanAirtimePhone("+234 803 412 7790"), "+2348034127790");
  assert.equal(pl.cleanAirtimePhone("2349034127790"), "+2349034127790");
  assert.equal(pl.cleanAirtimePhone("8034127790"), "+2348034127790");
  assert.equal(pl.cleanAirtimePhone("0603 412 7790"), null);
  assert.equal(pl.cleanAirtimePhone("12345"), null);
  assert.equal(pl.cleanNairaAmount("5,000", 20_000), 5000);
  assert.equal(pl.cleanNairaAmount("₦2500", 20_000), 2500);
  assert.equal(pl.cleanNairaAmount("0", 20_000), null);
  assert.equal(pl.cleanNairaAmount("25000", 20_000), null);
  assert.equal(pl.cleanNairaAmount("-5", 20_000), null);
  assert.equal(pl.cleanNairaAmount("abc", 20_000), null);
  assert.equal(pl.markPaidProblem({ method: "bank_transfer", reference: "" }), "Add the bank transfer reference.");
  assert.equal(pl.markPaidProblem({ method: "bank_transfer", reference: "GTB-123" }), null);
  assert.equal(pl.markPaidProblem({ method: "shop_paid", reference: "" }), null, "the shop paid them: no reference needed");
  assert.equal(pl.markPaidProblem({ method: "paypal", reference: "x" }), "Choose how it was paid.");
  assert.equal(pl.rewardProblem({ kind: "airtime_reward", amount: "500", phone: "08034127790", network: "mtn", reason: "First sale" }), null);
  assert.match(pl.rewardProblem({ kind: "airtime_reward", amount: "500", phone: "", network: "mtn", reason: "First sale" }), /phone/);
  assert.match(pl.rewardProblem({ kind: "airtime_reward", amount: "500", phone: "08034127790", network: "vodafone", reason: "x" }), /network/);
  assert.match(pl.rewardProblem({ kind: "airtime_reward", amount: "50000", phone: "08034127790", network: "mtn", reason: "x" }), /20,000/);
  assert.match(pl.rewardProblem({ kind: "airtime_reward", amount: "500", phone: "08034127790", network: "mtn", reason: "  " }), /for/);
  assert.equal(pl.rewardProblem({ kind: "adjustment", amount: "50000", reason: "Missed commission" }), null);
  assert.match(pl.rewardProblem({ kind: "resell", amount: "5", reason: "x" }), /airtime reward or adjustment/);
  for (const kind of ["resell", "creator_brief", "personal_shopper", "airtime_reward", "adjustment"]) assert.ok(pl.isPayoutSourceKind(kind), kind);
});

test("CSV: one row per line with bank details; formulas defused", () => {
  const csv = pl.ledgerCsv([
    {
      payday: "2026-11-06",
      earnerName: "=HYPERLINK(\"x\")",
      email: "ada@example.com",
      phone: "+2348034127790",
      bankName: "GTBank",
      accountNumber: "0123456789",
      accountName: "Ada Obi",
      owedBy: "Kemi's \"Bags\"",
      line: { id: "l1", earnerUserId: "u1", sourceKind: "resell", sourceId: "s1", storeId: "st1", amount: 1500, status: "paid", method: "bank_transfer", reference: "GTB-1", note: null, phone: null, network: null, paidAt: "2026-11-06T10:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z" },
    },
  ]);
  const [head, row] = csv.split("\r\n");
  assert.match(head, /^"Payday","Earner","Email","Phone","Bank","Account number"/);
  assert.match(row, /^"2026-11-06","'=HYPERLINK\(""x""\)"/);
  assert.match(row, /"0123456789","Ada Obi","Kemi's ""Bags""","Resell commission","1500","paid","Bank transfer","GTB-1"/);
});

test("wiring: migration is additive with RLS; schema models at the end", () => {
  const sql = read("docs/migrations/2026-12-16-payout-ledger.sql");
  for (const table of ["PayoutBatch", "PayoutLine", "ShopLinkHit"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), table);
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`), table);
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "PayoutLine_sourceKind_sourceId_key" ON "PayoutLine" \("sourceKind", "sourceId"\)/);
  assert.match(sql, /'resell', 'creator_brief', 'personal_shopper', 'airtime_reward', 'adjustment'/);
  assert.match(sql, /"weekStart" DATE NOT NULL/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|^\s*DELETE\b|\bALTER TABLE "(?!PayoutBatch|PayoutLine|ShopLinkHit)/im, "additive only");
  const schema = read("prisma/schema.prisma");
  for (const model of ["PayoutBatch", "PayoutLine", "ShopLinkHit"]) assert.match(schema, new RegExp(`model ${model} \\{`), model);
  assert.ok(schema.indexOf("model PayoutLine {") > schema.indexOf("model ResellSale {"), "appended after the last model");
  assert.match(schema.split("model PayoutLine {")[1].split("\n}")[0], /@@unique\(\[sourceKind, sourceId\]\)/);
});

test("wiring: marking paid records how and who, sets the resell sale paid, and is logged", () => {
  const server = read("src/lib/payouts/ledger.server.ts");
  assert.match(server, /data: \{ status: "paid", method: input\.method as PayoutMethod, reference, [\s\S]{0,60}paidAt: now, paidBy: input\.adminId \}/);
  assert.match(server, /tx\.resellSale\.updateMany\(\{ where: \{ id: \{ in: resellSaleIds \}, status: \{ in: \["pending", "approved"\] \} \}, data: \{ status: "paid" \} \}\)/);
  assert.match(server, /createMany\(\{ data: plan\.create[\s\S]*skipDuplicates: true \}\)/, "the sync is idempotent");
  for (const action of ["payout_paid", "payout_void", "airtime_reward", "payout_export"]) assert.match(server, new RegExp(`"${action}"`), action);
  assert.match(server, /logDataAccess\(/);
  // Every exported server action checks the caller (money section).
  const actions = read("src/app/actions/admin-payouts.ts");
  assert.ok(actions.startsWith('"use server"'));
  const exported = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n\s*const admin = await requireAdminSection\("money"\);/g)].map((m) => m[1]);
  assert.deepEqual(exported.sort(), ["addPayoutRewardAction", "closePayoutWeekAction", "markPayoutLinesPaidAction", "voidPayoutLinesAction"]);
  assert.equal((actions.match(/export async function/g) ?? []).length, 4);
});

test("wiring: the admin page and CSV are money-section only; bank details only there", () => {
  assert.match(read("src/app/admin/payouts/page.tsx"), /requireAdminSection\("money"\)/);
  assert.match(read("src/app/api/admin/payouts/export/route.ts"), /withAdmin\(/);
  assert.equal(team.sectionForPath("/admin/payouts"), "money");
  assert.equal(team.sectionForPath("/api/admin/payouts/export"), "money");
  assert.equal(team.adminCanOpen("finance", "/admin/payouts"), true);
  assert.equal(team.adminCanOpen("support", "/admin/payouts"), false);
  assert.equal(team.adminCanOpen("growth", "/api/admin/payouts/export"), false);
  // The earner's own API returns totals only: never bank details or other people's lines.
  const market = read("src/app/api/app/resell/market/route.ts");
  assert.match(market, /earnerLedger\(user\.id\)/);
  const summary = read("src/lib/payouts/ledger.server.ts").split("export async function earnerLedger")[1];
  assert.match(summary, /where: \{ earnerUserId: userId/);
  assert.doesNotMatch(summary, /wallet|accountNumber/);
});

test("wiring: sidebar item with nav keys in every language", () => {
  const item = nav.NAV_BY_ROLE.admin.flatMap((group) => group.items).find((entry) => entry.id === "payouts");
  assert.equal(item?.href, "/admin/payouts");
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(CATALOGS.nav[locale]["admin.payouts"], locale);
  assert.ok(team.adminNavIds("finance").includes("payouts"));
  assert.ok(!team.adminNavIds("support").includes("payouts"));
});

test("wiring: the earner sees owed / paid from the ledger on /resell and the phone, in five languages", () => {
  assert.match(read("src/app/resell/ResellMarket.tsx"), /data\.ledger \?[\s\S]*t\("ledger\.owed"\)[\s\S]*t\("ledger\.paid"\)/);
  assert.match(read("apps/mobile/src/app/resell.tsx"), /data\.ledger \?[\s\S]*t\("ledger\.owed"\)[\s\S]*t\("ledger\.paid"\)/);
  assert.match(read("apps/mobile/src/lib/resell.ts"), /ledger\?: ResellLedger \| null/);
  for (const key of ["ledger.title", "ledger.owed", "ledger.paid", "ledger.note"]) {
    for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(CATALOGS.resell[locale][key], `${locale}/${key}`);
  }
  assert.ok(existsSync(new URL("../src/app/admin/payouts/PayoutActions.tsx", import.meta.url)));
});
