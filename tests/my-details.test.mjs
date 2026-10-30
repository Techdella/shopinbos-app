// "My details" for every role (shared/my-details.ts): the rules the API checks (src/lib/my-details-rules.ts), the
// checked email and phone changes (src/lib/my-details.server.ts), the routes, the web pages and the phone screen,
// the links to it from each role's account screens, and its words in every language.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const details = await import("../shared/my-details.ts");
const rules = await import("../src/lib/my-details-rules.ts");
const pv = await import("../src/lib/commerce/phone-verify.ts");
const partner = await import("../apps/mobile/src/lib/partner-pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

// ─── Shared helpers ──────────────────────────────────────────────────────────

test("business form: every field a trimmed string, capped to its column", () => {
  assert.deepEqual(details.businessForm(null), { name: "", phone: "", address: "", city: "", state: "" });
  const form = details.businessForm({ name: "  Ada   Fabrics ", phone: null, city: "Ikeja", state: undefined, address: "x".repeat(500) });
  assert.equal(form.name, "Ada Fabrics");
  assert.equal(form.phone, "");
  assert.equal(form.address.length, details.BUSINESS_LIMITS.address);
});

test("business changes: only what changed, compared trimmed", () => {
  const saved = { name: "Ada Fabrics", phone: "0803 123 4567", address: "", city: "Ikeja", state: "Lagos" };
  assert.deepEqual(details.businessChanges(saved, { ...saved, name: " Ada Fabrics " }), {});
  assert.deepEqual(details.businessChanges(saved, { ...saved, city: "Yaba", address: "12 Herbert Macaulay" }), { address: "12 Herbert Macaulay", city: "Yaba" });
  assert.deepEqual(details.businessChanges(saved, { state: "" }), { state: "" }, "clearing a field is a change");
  assert.deepEqual(details.businessChanges(null, { name: "New shop" }), { name: "New shop" });
});

test("emails compare without case; phones by their last 10 digits", () => {
  assert.equal(details.sameEmail("Ada@Example.com ", "ada@example.com"), true);
  assert.equal(details.sameEmail(null, ""), false);
  assert.equal(details.samePhone("+234 803 123 4567", "08031234567"), true);
  assert.equal(details.samePhone("08031234567", "08031234568"), false);
  assert.equal(details.samePhone(null, null), false);
});

test("each role's business words and web page", () => {
  assert.equal(details.businessKind("seller"), "shop");
  assert.equal(details.businessKind("supplier"), "supplier");
  assert.equal(details.businessKind("logistics_partner"), "partner");
  assert.equal(details.businessKind("admin"), null);
  assert.deepEqual(details.DETAILS_HREF, { seller: "/home/details", supplier: "/supplier/details", logistics_partner: "/logistics/details", admin: "/admin/settings" });
  for (const role of ["seller", "supplier", "logistics_partner"]) assert.ok(existsSync(new URL(`../src/app${details.DETAILS_HREF[role]}/page.tsx`, import.meta.url)), role);
});

// ─── What the API accepts ────────────────────────────────────────────────────

test("details patch: a name, business fields, or both; never nothing", () => {
  assert.equal(rules.DetailsPatchSchema.safeParse({ name: "Ada Obi" }).success, true);
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: { city: "Ikeja", state: "Lagos" } }).success, true);
  assert.equal(rules.DetailsPatchSchema.safeParse({}).success, false);
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: {} }).success, false);
  assert.equal(rules.DetailsPatchSchema.safeParse({ name: "A" }).success, false, "a name needs 2 letters");
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: { name: " " } }).success, false, "a business name can't be cleared");
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: { phone: "" } }).success, true, "the business phone can be cleared");
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: { phone: "0803 123 4567" } }).success, true);
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: { phone: "call me" } }).success, false);
  assert.equal(rules.DetailsPatchSchema.safeParse({ business: { phone: "123" } }).success, false);
  const parsed = rules.DetailsPatchSchema.parse({ name: "  Ada Obi ", business: { address: " 12 Herbert Macaulay " } });
  assert.equal(parsed.name, "Ada Obi");
  assert.equal(parsed.business.address, "12 Herbert Macaulay");
});

test("email change: a real address, lower-cased", () => {
  assert.equal(rules.EmailChangeSchema.parse({ email: " Ada@Example.COM " }).email, "ada@example.com");
  assert.equal(rules.EmailChangeSchema.safeParse({ email: "ada@" }).success, false);
  assert.equal(rules.EmailChangeSchema.safeParse({}).success, false);
});

test("phone change: send a code, then verify it with the challenge", () => {
  assert.equal(rules.PhoneChangeSchema.safeParse({ action: "send", phone: "08031234567" }).success, true);
  assert.equal(rules.PhoneChangeSchema.safeParse({ action: "send", phone: "08031234567", via: "sms" }).success, true);
  assert.equal(rules.PhoneChangeSchema.safeParse({ action: "send", phone: "" }).success, false);
  assert.equal(rules.PhoneChangeSchema.safeParse({ action: "verify", phone: "+2348031234567", code: "123456" }).success, false, "no challenge");
  assert.equal(rules.PhoneChangeSchema.safeParse({ action: "verify", phone: "+2348031234567", challenge: "c", code: "123456" }).success, true);
  assert.equal(rules.PhoneChangeSchema.safeParse({ action: "save", phone: "+2348031234567" }).success, false);
});

test("a phone code only changes the phone of the account it was sent for", () => {
  const secret = "test-secret";
  const phone = "+2348031234567";
  const { challenge } = pv.createPhoneChallenge({ phone, storeId: details.accountPhoneScope("user_1"), code: "123456" }, secret);
  assert.deepEqual(pv.checkPhoneChallenge({ challenge, phone, storeId: details.accountPhoneScope("user_1"), code: "123456" }, secret), { ok: true });
  assert.deepEqual(pv.checkPhoneChallenge({ challenge, phone, storeId: details.accountPhoneScope("user_2"), code: "123456" }, secret), { ok: false, reason: "invalid" });
  assert.deepEqual(pv.checkPhoneChallenge({ challenge, phone: "+2348030000000", storeId: details.accountPhoneScope("user_1"), code: "123456" }, secret), { ok: false, reason: "invalid" });
  assert.match(details.accountPhoneCodeMessage("654321"), /654321/);
});

// ─── Checked email and phone changes ─────────────────────────────────────────

test("email changes through Supabase's confirmation links, never written straight in", () => {
  const server = read("src/lib/my-details.server.ts");
  assert.match(server, /\/auth\/v1\/user\?redirect_to=/, "the same call as supabase.auth.updateUser({ email })");
  assert.match(server, /\/auth\/email-changed/);
  assert.match(server, /method: "PUT"/);
  // Another account's email is refused before Supabase is asked (profile or login), and when Supabase says so.
  assert.match(server, /NOT: \{ id: person\.id \}/);
  assert.match(server, /loginTakenByOther\(\{ email \}/);
  assert.match(server, /email_exists/);
  // The account's email follows only once Supabase has it confirmed.
  assert.match(server, /login\.email_confirmed_at && !sameEmail\(login\.email, email\)/);
  assert.ok(existsSync(new URL("../src/app/auth/email-changed/page.tsx", import.meta.url)));
});

test("the sign-in phone changes only after the code, and never to another account's number", () => {
  const server = read("src/lib/my-details.server.ts");
  const confirm = server.slice(server.indexOf("export async function confirmPhoneCode"));
  assert.ok(confirm.indexOf("checkPhoneChallenge") < confirm.indexOf("updateUserById"), "code checked first");
  assert.match(confirm, /updateUserById\(person\.supabaseId, \{ phone, phone_confirm: true \}\)/);
  assert.match(confirm, /db\.user\.update\(\{ where: \{ id: person\.id \}, data: \{ phone \} \}\)/);
  assert.match(server, /phoneOwner\(phone, person\.id\)/);
  assert.match(server, /loginTakenByOther\(\{ phone \}/);
  assert.match(server, /PHONE_CODE_LIMIT/);
  // A seller's staff member changes their own login, not the owner's.
  assert.match(server, /user\.staff\.userId/);
  // The business phone is saved directly, apart from the sign-in phone.
  assert.match(server, /whatsappNumber: biz\.phone/);
  assert.match(server, /contactPhone: biz\.phone/);
  assert.match(server, /address\.phone = biz\.phone/);
});

test("routes: every role, schema-checked, errors in the API shape", () => {
  for (const name of ["details", "email", "phone"]) {
    const route = read(`src/app/api/app/me/${name}/route.ts`);
    assert.match(route, /withAuth\(/, name);
    assert.match(route, /safeParse/, name);
    assert.match(route, /DetailsError/, name);
  }
  assert.match(read("src/app/api/app/me/details/route.ts"), /export const PATCH/);
});

// ─── Where people find it ────────────────────────────────────────────────────

test("web: one form for every role, in the account menu and each role's settings", () => {
  for (const page of ["src/app/home/details/page.tsx", "src/app/supplier/details/page.tsx", "src/app/logistics/details/page.tsx"]) {
    assert.match(read(page), /<MyDetailsForm initial=\{details\}/, page);
  }
  const form = read("src/components/profile/MyDetailsForm.tsx");
  for (const path of ["/api/app/me/details", "/api/app/me/email", "/api/app/me/phone"]) assert.ok(form.includes(path), path);
  assert.match(form, /kind="avatar"/);
  assert.match(form, /kind="logo"/);
  assert.match(read("src/components/shell/GlobalTopBar.tsx"), /DETAILS_HREF\[role\]/);
  assert.match(read("src/app/supplier/settings/page.tsx"), /href: "\/supplier\/details"/);
  assert.match(read("src/app/logistics/profile/page.tsx"), /href="\/logistics\/details"/);
  const seller = read("src/app/home/settings/page.tsx");
  assert.match(seller, /DETAILS_HREF\.seller/);
  assert.doesNotMatch(seller, /name="phone"/, "the login phone isn't typed over in Settings any more");
});

test("phone: one screen for every role, one tap from each account screen", () => {
  const screen = read("apps/mobile/src/app/my-details.tsx");
  assert.match(screen, /fetchMyDetails/);
  assert.match(screen, /requestEmailChange/);
  assert.match(screen, /sendPhoneChangeCode/);
  assert.match(screen, /confirmPhoneChange/);
  assert.match(screen, /pickImage\("logo"\)/);
  assert.match(screen, /pickImage\("avatar"\)/);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /path: "app:\/my-details"/);
  for (const file of ["apps/mobile/src/app/settings.tsx", "apps/mobile/src/app/supplier/account.tsx", "apps/mobile/src/app/logistics/profile.tsx"]) {
    assert.match(read(file), /router\.push\("\/my-details"\)/, file);
  }
  for (const role of ["seller", "supplier", "logistics_partner"]) assert.equal(partner.canVisit(role, "/my-details"), true, role);
  assert.equal(partner.canVisit(null, "/my-details"), false);
});

// ─── Words ───────────────────────────────────────────────────────────────────

test("every My details word is in all five languages, with the same placeholders", () => {
  const ns = CATALOGS.details;
  const keys = Object.keys(ns.en);
  for (const lang of ["pcm", "yo", "ha", "ig"]) {
    for (const key of keys) {
      assert.ok(ns[lang][key], `${lang} ${key}`);
      const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
      assert.equal(holes(ns[lang][key]), holes(ns.en[key]), `${lang} ${key} placeholders`);
    }
  }
  // Every key the screens use is in English (template keys for each kind of business too).
  const used = [read("apps/mobile/src/app/my-details.tsx"), read("src/components/profile/MyDetailsForm.tsx"), read("src/app/auth/email-changed/page.tsx")].join("\n");
  for (const [, key] of used.matchAll(/\bt\("([\w.]+)"/g)) assert.ok(key in ns.en || key === "cancel", key);
  for (const kind of ["shop", "supplier", "partner"]) for (const part of ["title", "name", "phone", "address"]) assert.ok(ns.en[`biz.${kind}.${part}`], `${kind} ${part}`);
  for (const outcome of ["done", "half", "failed"]) for (const part of ["title", "body"]) assert.ok(ns.en[`emailLink.${outcome}.${part}`]);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    assert.ok(CATALOGS.m_shop[lang]["link.myDetails.label"], `m_shop ${lang}`);
    assert.ok(CATALOGS.supplier[lang]["settings.link.details.label"], `supplier ${lang}`);
  }
});
