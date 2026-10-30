// Admin › Accounts (shared/admin-accounts.ts, src/lib/admin/accounts.server.ts, /admin/accounts): pick a seller,
// supplier or delivery partner from a list or a search, change their details, choose the pilot features they test,
// and give them credits or a free plan.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const accounts = await import("../shared/admin-accounts.ts");
const team = await import("../src/lib/admin-team/pure.ts");

test("each role edits its own fields, cleaned", () => {
  const ok = accounts.cleanAccountDetails("supplier", { name: "  Ada  Obi ", phone: "0803 412 7790", city: "Lagos", business: "Ada Fabrics", description: "", address: "", whatsapp: "803-412-7790", website: "adafabrics.com" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, { name: "Ada Obi", phone: "+2348034127790", city: "Lagos", business: "Ada Fabrics", description: null, address: null, whatsapp: "+2348034127790", website: "https://adafabrics.com/" });
  assert.deepEqual(Object.keys(accounts.cleanAccountDetails("seller", { name: "Ada", city: "Lagos", business: "Ada", contactEmail: "x" }).values), ["name", "phone", "city", "business", "description"], "a seller has no supplier or partner fields");
  assert.match(accounts.cleanAccountDetails("seller", { name: "Ada", city: "", business: "Shop" }).error, /city/);
  assert.match(accounts.cleanAccountDetails("seller", { name: "Ada", city: "Lagos", business: "Shop", phone: "12" }).error, /phone number/);
  assert.match(accounts.cleanAccountDetails("logistics_partner", { name: "Ada", city: "Lagos", business: "Swift", contactEmail: "nope" }).error, /email/);
  assert.deepEqual(accounts.changedFields({ name: "Ada", city: "Lagos" }, { name: "Ada", city: "Abuja" }), ["city"]);
});

test("wiring: who can do what, logged first, and the picker on both pages", () => {
  assert.equal(team.sectionForPath("/admin/accounts"), "partners");
  const service = read("src/lib/admin/accounts.server.ts");
  assert.ok(service.indexOf('action: "edit_account"') < service.indexOf("db.$transaction"), "logged before it's saved");
  assert.match(service, /Another account already has that phone number/);
  assert.match(service, /kind: "user", value: user\.id/, "pilot testers are Person targets, like Admin › Pilot features");
  assert.match(service, /clearFeatureSwitchCache\(\)/);
  const actions = read("src/app/admin/accounts/actions.ts");
  assert.match(actions, /isFullAdmin\(admin\.adminRole\)/, "pilot testers: owners and admins only");
  const page = read("src/app/admin/accounts/page.tsx");
  assert.match(page, /canUseSection\(admin\.adminRole, "money"\)/, "gifts need the money section");
  for (const path of ["src/app/admin/accounts/page.tsx", "src/app/admin/pricing/gifts/page.tsx"]) {
    assert.match(read(path), /<AccountPicker /, path);
    assert.match(read(path), /<GiftForms /, path);
  }
  assert.match(read("src/app/admin/pricing/gifts/actions.ts"), /const PAGES = \[PAGE, "\/admin\/accounts"\]/, "gift actions only go back to their own pages");
  for (const path of ["src/app/admin/sellers/[id]/page.tsx", "src/app/admin/suppliers/[id]/page.tsx", "src/app/admin/logistics-partners/[id]/page.tsx"]) assert.match(read(path), /\/admin\/accounts\?user=/, path);
});
