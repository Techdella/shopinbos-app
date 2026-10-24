// The phone app's seller Payments and payouts, Delivery and Settings screens (apps/mobile/src/app/{payments,
// delivery,settings}.tsx), the routes made for them (/api/app/payments, /api/app/payout-bank/resolve,
// /api/app/settings/profile) and the rules they share with the web pages. Pure helpers are loaded directly.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const money = await import("../shared/seller-payments.ts");
const rules = await import("../src/lib/seller-settings-rules.ts");
const pure = await import("../apps/mobile/src/lib/settings-pure.ts");
const { NAMESPACES } = await import("../shared/i18n/catalog.ts");

// ─── Money settings (shared by the web actions and /api/app/payments) ────────

test("payment methods: always every key, and at least one must stay on", () => {
  assert.deepEqual(money.cleanPaymentMethods({ card: true, korapay: false, cod: 1, junk: true }), { transfer: false, card: true, korapay: false, cod: true, wa: false });
  assert.deepEqual(money.cleanPaymentMethods(null), { transfer: false, card: false, korapay: false, cod: false, wa: false });
  assert.equal(money.paymentMethodsProblem(money.cleanPaymentMethods({})), "keepOne");
  assert.equal(money.paymentMethodsProblem(money.cleanPaymentMethods({ wa: true })), null);
});

test("payment switches read the way checkout reads them", () => {
  // Never saved: card only (checkout offers card only), not the onboarding defaults.
  assert.deepEqual(money.readShopPaymentMethods({}), { transfer: false, card: true, korapay: false, cod: false, wa: false });
  assert.deepEqual(money.readShopPaymentMethods({ paymentConfig: { methods: { cod: true } } }), { transfer: false, card: false, korapay: false, cod: true, wa: false });
});

test("transfer window: the listed hours or the default", () => {
  for (const hours of [null, 2, 6, 12, 24, 48, 72]) assert.equal(money.isTransferWindowChoice(hours), true, String(hours));
  for (const hours of [0, 5, 100, "24", undefined]) assert.equal(money.isTransferWindowChoice(hours), false, String(hours));
});

test("payout bank summary never carries the full account number", () => {
  assert.equal(money.readPayoutBankSummary({}), null);
  const summary = money.readPayoutBankSummary({ payoutBank: { bankName: "Opay", accountName: "Ada Obi", accountNumberMask: "******6789", verificationStatus: "verified", paystackRecipientCode: "RCP_x" } });
  assert.deepEqual(summary, { bankName: "Opay", accountName: "Ada Obi", accountEnding: "6789", status: "verified" });
  assert.equal(money.cleanAccountNumber("0123 456-789"), "0123456789");
  assert.equal(money.cleanAccountNumber("012345678"), null);
  assert.equal(money.cleanAccountNumber("01234567890"), null);
});

test("money summary: online vs collected, refunds, Lagos days and methods", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const at = (iso) => new Date(iso);
  const summary = money.summarizeMoney(
    [
      { total: 5000, status: "paid", paymentMethod: null, createdAt: at("2026-10-14T08:00:00Z") },
      { total: 3000, status: "delivered", paymentMethod: "paystack", createdAt: at("2026-10-13T23:30:00Z") }, // 00:30 in Lagos, the 14th
      { total: 2000, status: "paid", paymentMethod: "cash", createdAt: at("2026-10-10T12:00:00Z") },
      { total: 9000, status: "pending", paymentMethod: null, createdAt: at("2026-10-12T12:00:00Z") },
      { total: 1500, status: "refunded", paymentMethod: null, createdAt: at("2026-10-11T12:00:00Z") },
    ],
    now,
  );
  assert.equal(summary.paidCount, 3);
  assert.equal(summary.online, 8000);
  assert.equal(summary.offline, 2000);
  assert.equal(summary.moneyIn, 10000);
  assert.equal(summary.refunded, 1500);
  assert.equal(summary.daily.length, 14);
  assert.deepEqual(summary.daily.at(-1), { day: "2026-10-14", total: 8000 });
  assert.equal(summary.daily.find((row) => row.day === "2026-10-10").total, 2000);
  assert.deepEqual(summary.byMethod, [{ method: null, total: 8000 }, { method: "cash", total: 2000 }]);
});

// ─── Route bodies ─────────────────────────────────────────────────────────────

test("PATCH /api/app/payments: methods and/or a listed time, nothing else", () => {
  const ok = (body) => rules.PaymentsPatchSchema.safeParse(body).success;
  assert.ok(ok({ methods: { transfer: true, card: true, korapay: false, cod: false, wa: false } }));
  assert.ok(ok({ transferWindowHours: 48 }));
  assert.ok(ok({ transferWindowHours: null }));
  assert.ok(!ok({}), "nothing to save");
  assert.ok(!ok({ transferWindowHours: 5 }), "not a listed time");
  assert.ok(!ok({ methods: { card: true } }), "every method is sent");
});

test("POST /api/app/payout-bank/resolve: a bank and 10 digits", () => {
  const parsed = rules.ResolveAccountSchema.safeParse({ bankName: "Opay", accountNumber: "0123 456 789" });
  assert.ok(parsed.success);
  assert.equal(parsed.data.accountNumber, "0123456789");
  assert.ok(!rules.ResolveAccountSchema.safeParse({ bankName: "Opay", accountNumber: "12345" }).success);
  assert.ok(!rules.ResolveAccountSchema.safeParse({ bankName: "", accountNumber: "0123456789" }).success);
});

test("PATCH /api/app/settings/profile: partial, trimmed, with plain limits", () => {
  const parse = (body) => rules.ProfilePatchSchema.safeParse(body);
  assert.deepEqual(parse({ shop: { city: "  Ikeja " } }).data, { shop: { city: "Ikeja" } });
  assert.ok(parse({ me: { name: "Ada Obi", phone: "+234 803 000 0000" } }).success);
  assert.ok(parse({ shop: { description: "" } }).success, "a description can be cleared");
  assert.ok(!parse({}).success, "nothing to save");
  assert.ok(!parse({ shop: {} }).success, "nothing to save");
  assert.ok(!parse({ shop: { name: "   " } }).success, "the shop keeps a name");
  assert.ok(!parse({ me: { name: "A" } }).success);
  assert.ok(!parse({ me: { phone: "call me" } }).success);
  assert.ok(!parse({ shop: { slug: "x" } }).success, "the web address isn't changed here");
});

test("business address is cleaned the same way for the web form and the phone", () => {
  const clean = rules.cleanBusinessAddress({ line1: "  12   Adeola  Odeku ", email: "Hello@Shop.NG", phone: "0".repeat(60), state: "Lagos" });
  assert.equal(clean.line1, "12 Adeola Odeku");
  assert.equal(clean.email, "hello@shop.ng");
  assert.equal(clean.phone.length, 40);
  assert.equal(clean.state, "Lagos");
  assert.equal(clean.legalName, "");
  assert.equal(rules.cleanBusinessAddress({ email: "not an email" }).email, "");
});

// ─── Phone helpers ────────────────────────────────────────────────────────────

test("delivery areas: typed places become a clean list", () => {
  assert.deepEqual(pure.addAreas(["Ikeja"], "ikeja, Yaba,\nLekki ,  "), ["Ikeja", "Yaba", "Lekki"]);
  assert.equal(pure.addAreas([], "x".repeat(100))[0].length, 80);
  assert.equal(pure.areasLine(["A", "B", "C", "D", "E"]), "A · B · C +2");
  assert.equal(pure.areasLine([]), "");
});

test("delivery fee: 0 is free, words aren't a fee", () => {
  assert.equal(pure.parseFee("1,500"), 1500);
  assert.equal(pure.parseFee("₦ 2000"), 2000);
  assert.equal(pure.parseFee("0"), 0);
  assert.equal(pure.parseFee(""), null);
  assert.equal(pure.parseFee("abc"), null);
  assert.equal(pure.parseFee("-5"), null);
});

test("zone body keeps the price's other details, and leaves several prices alone", () => {
  const draft = { name: " Mainland ", areas: ["Ikeja"], pendingArea: "Yaba", fee: "2,500", active: true };
  assert.equal(pure.zoneProblem({ ...draft, name: " " }), "needName");
  assert.equal(pure.zoneProblem({ ...draft, fee: "" }), "needFee");
  assert.equal(pure.zoneProblem(draft), null);

  assert.deepEqual(pure.zoneBody(draft), {
    name: "Mainland",
    regions: ["Ikeja", "Yaba"],
    active: true,
    rates: [{ minWeight: 0, name: "Standard delivery", minValue: 0, price: 2500 }],
  });

  const onboarding = { rates: [{ name: "Standard delivery", minValue: 0, minWeight: 0, price: 1500, source: "onboarding", estimatedDays: "1-2" }] };
  assert.equal(pure.feeText(onboarding), "1500");
  assert.deepEqual(pure.zoneBody(draft, onboarding).rates, [{ minWeight: 0, source: "onboarding", estimatedDays: "1-2", name: "Standard delivery", minValue: 0, price: 2500 }]);

  const tiers = { rates: [{ name: "Small", price: 1000 }, { name: "Big", price: 3000 }] };
  assert.equal(pure.feeEditable(tiers), false);
  assert.equal(pure.zoneProblem({ ...draft, fee: "" }, tiers), null, "no fee box for several prices");
  assert.equal("rates" in pure.zoneBody(draft, tiers), false);
});

test("bank picker and account box", () => {
  const banks = ["Access Bank", "Guaranty Trust Bank (GTBank)", "Opay", "Zenith Bank"];
  assert.deepEqual(pure.filterBanks(banks, "gt"), ["Guaranty Trust Bank (GTBank)"]);
  assert.deepEqual(pure.filterBanks(banks, "  "), banks);
  assert.deepEqual(pure.filterBanks(banks, "zenith bank"), ["Zenith Bank"]);
  assert.equal(pure.accountDigits("0123-456 789 99"), "0123456789");
});

test("settings save only what changed", () => {
  assert.deepEqual(pure.changedFields({ name: "Ada", phone: "" }, { name: "Ada ", phone: " 0803 " }), { phone: "0803" });
  assert.deepEqual(pure.changedFields({ name: "Ada" }, { name: "Ada" }), {});
});

// ─── Wiring ───────────────────────────────────────────────────────────────────

test("new routes are seller-only and call the same lib as the web", () => {
  for (const path of ["src/app/api/app/payments/route.ts", "src/app/api/app/payout-bank/resolve/route.ts", "src/app/api/app/settings/profile/route.ts"]) {
    const source = read(path);
    assert.match(source, /withSeller\(/, path);
    assert.doesNotMatch(source, /withAuth\(/, path);
    assert.match(source, /\.safeParse\(/, `${path} validates with zod`);
  }
  assert.match(read("src/app/api/app/payments/route.ts"), /saveSellerPaymentMethods[\s\S]*saveSellerTransferWindow/);
  assert.match(read("src/app/api/app/settings/profile/route.ts"), /saveSellerProfile/);
  assert.match(read("src/app/api/app/payout-bank/resolve/route.ts"), /checkRateLimit/);

  const actions = read("src/app/home/payments/actions.ts");
  assert.match(actions, /saveSellerPaymentMethods/);
  assert.match(actions, /saveSellerTransferWindow/);
  assert.doesNotMatch(actions, /db\.store\.update/, "the payments actions don't keep their own copy");
  const workspace = read("src/app/actions/workspace.ts");
  assert.match(workspace, /saveStoreDetails\(/);
  assert.match(workspace, /saveSellerBusinessAddress\(/);
  assert.doesNotMatch(read("src/app/home/payments/page.tsx"), /function readMethods|function readBank/);
});

test("the three screens exist (Delivery's own prices are app/delivery/zones.tsx), use the m_settings words and keep the rest on the web", () => {
  assert.ok(NAMESPACES.includes("m_settings"));
  for (const screen of ["payments", "delivery/zones", "settings"]) {
    const path = `apps/mobile/src/app/${screen}.tsx`;
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
    assert.match(read(path), /useT\("m_settings"/, path);
  }
  const english = read("shared/i18n/messages/m_settings/en.ts");
  for (const screen of ["payments", "delivery/zones", "settings"]) {
    for (const [, key] of read(`apps/mobile/src/app/${screen}.tsx`).matchAll(/\bt\("((?:money|bank|del|set)\.[\w.]+)"/g)) {
      assert.ok(english.includes(`"${key}":`), `${screen}: ${key}`);
    }
  }
  const settings = read("apps/mobile/src/app/settings.tsx");
  assert.doesNotMatch(settings, /openWeb\(/, "no row sends the seller to the web's Settings");
  assert.match(settings, /router\.push\("\/notifications\/settings"\)/);
  assert.match(settings, /<LanguageRow/);
  assert.match(settings, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(read("apps/mobile/src/lib/seller-settings.ts"), /\/api\/app\/me\/images/);
  assert.match(read("apps/mobile/src/app/delivery/zones.tsx"), /router\.push\("\/delivery\/find"/, "booking a courier finds a delivery partner in the app");
  assert.doesNotMatch(read("apps/mobile/src/app/delivery/zones.tsx"), /openWeb\(/);
  assert.match(read("apps/mobile/src/app/delivery/zones.tsx"), /Alert\.alert\(/, "delete asks first");
});
