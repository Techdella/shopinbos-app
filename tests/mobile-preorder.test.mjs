// Preorders in the phone app (apps/mobile) and the JSON APIs it uses: the form rules (lib/preorder-pure.ts, the same
// as shared/preorder.ts), the words in five languages, and the screens and routes that carry them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pure = await import("../apps/mobile/src/lib/preorder-pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

const NOW = new Date("2026-10-27T10:00:00Z");

test("the form: only changes are sent, with the server's own checks", () => {
  const saved = { enabled: true, shipsOn: "2026-10-01", limit: 50, taken: 12, note: "Ships in October" };
  const form = pure.preorderFormFrom(saved);
  assert.deepEqual(form, { enabled: true, shipsOn: "2026-10-01", limit: "50", note: "Ships in October" });
  assert.deepEqual(pure.preorderPatch(form, saved, NOW), { ok: true, patch: null }, "nothing changed (a saved date that passed still saves)");
  assert.deepEqual(pure.preorderPatch({ ...form, limit: "" }, saved, NOW), { ok: true, patch: { enabled: true, shipsAt: "2026-10-01", limit: null, note: "Ships in October" } });
  assert.deepEqual(pure.preorderPatch({ ...form, shipsOn: "2026-10-20" }, saved, NOW), { ok: false, problem: "past" }, "a new date can't be past");
  assert.deepEqual(pure.preorderPatch({ ...form, limit: "0" }, saved, NOW), { ok: false, problem: "limit" });
  assert.deepEqual(pure.preorderPatch({ ...form, shipsOn: "soon" }, saved, NOW), { ok: false, problem: "date" });
  assert.deepEqual(pure.preorderPatch({ ...form, enabled: false }, saved, NOW).patch?.enabled, false, "switching off keeps the rest for next time");
  // A new product: nothing to send until it's switched on.
  assert.deepEqual(pure.preorderPatch(pure.preorderFormFrom(null), null, NOW), { ok: true, patch: null });
  const on = pure.preorderPatch({ enabled: true, shipsOn: pure.dayFromNow(14, NOW), limit: "1,000", note: "  Promise  " }, null, NOW);
  assert.deepEqual(on, { ok: true, patch: { enabled: true, shipsAt: "2026-11-10", limit: 1000, note: "Promise" } });
  for (const key of Object.values(pure.PREORDER_PROBLEM_KEY)) assert.ok(key in CATALOGS.m_ui.en, key);
});

test("a supplier listing's columns, lines, buttons and pills", () => {
  const saved = pure.savedFromColumns({ preorderEnabled: true, preorderShipsAt: "2026-12-12T12:00:00.000Z", preorderLimit: 50, preorderTaken: 42, preorderNote: "Container lands 10 Dec" });
  assert.deepEqual(saved, { enabled: true, shipsOn: "2026-12-12", limit: 50, taken: 42, note: "Container lands 10 Dec" });
  const state = pure.stateOf(saved);
  assert.equal(pure.preorderLineText(state, NOW), "Ships from 12 Dec · 8 left", "the same line as shared/preorder.ts preorderLine");
  assert.equal(pure.preorderLineText({ ...state, shipsOn: "2026-10-01" }, NOW), "Ships soon · 8 left", "a date that passed");
  assert.equal(pure.preorderLineText({ ...state, open: false, left: 0 }, NOW), "Preorders are full");
  assert.equal(pure.preorderLineText(null, NOW), null);
  assert.equal(pure.shipDayText("2027-01-05", NOW), "5 Jan 2027", "another year names the year");
  assert.deepEqual(pure.preorderButton(state, 20, "₦240,000"), { label: "Preorder 20 for ₦240,000", disabled: true }, "more than the places left");
  assert.deepEqual(pure.preorderButton(state, 8, "₦96,000"), { label: "Preorder 8 for ₦96,000", disabled: false });
  assert.deepEqual(pure.preorderButton({ ...state, open: false, left: 0 }, 5, "₦1"), { label: "Preorders are full", disabled: true });
  assert.equal(pure.preorderPillText({ shipsOn: "2026-12-12" }, NOW), "Preorder · 12 Dec");
  assert.equal(pure.preorderPillText({ shipsOn: null }, NOW), "Preorder");
  assert.equal(pure.preorderPillText(null, NOW), null);
  // Words in the app language.
  const yo = { dynamic: (key, fallback, vars) => (key === "day.month.11" ? "Dec-yo" : key === "preorder.pillDate" ? `P · ${vars.date}` : fallback) };
  assert.equal(pure.preorderPillText({ shipsOn: "2026-12-12" }, NOW, yo), "P · 12 Dec-yo");
  assert.equal(pure.isDropshipProduct({ dropship: { relationshipId: "r" } }), true);
  assert.equal(pure.isDropshipProduct({ inventoryType: "dropshipping" }), true);
  assert.equal(pure.isDropshipProduct({ fulfillmentType: "merchant_fulfilled", inventoryType: "physical" }), false);
});

test("every preorder word is in all five languages, with the same placeholders", () => {
  const ui = CATALOGS.m_ui;
  const keys = Object.keys(ui.en).filter((key) => key.startsWith("preorder."));
  assert.ok(keys.length >= 30);
  for (const locale of ["pcm", "yo", "ha", "ig"]) {
    for (const key of keys) {
      assert.equal(typeof ui[locale][key], "string", `${locale}: ${key}`);
      const want = (ui.en[key].match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal((ui[locale][key].match(/\{\w+\}/g) ?? []).sort().join(), want, `${locale}: ${key}`);
    }
  }
  assert.match(ui.en["preorder.noEscrow"], /doesn't hold preorder money/);
  assert.match(ui.yo["preorder.full"], /[ẹọṣ]/);
  assert.match(ui.ha["preorder.take"], /[ɓɗƙ]/);
  assert.match(ui.ig["preorder.title"], /[ịọụ]/);
});

test("supplier JSON APIs take `preorder` and save it with shared/preorder.ts", () => {
  const schemas = read("src/lib/schemas/index.ts");
  assert.ok(schemas.indexOf("export const PreorderInputSchema") < schemas.indexOf("export const SupplierProductCreateSchema"), "defined before it's used");
  assert.match(schemas, /status: ProductStatusSchema\.default\("draft"\),[\s\S]{0,300}preorder: PreorderInputSchema\.optional\(\),\s*\}\);\s*export const SupplierProductUpdateSchema/);

  const create = read("src/app/api/supplier/products/route.ts");
  assert.match(create, /const \{ preorder, \.\.\.fields \} = parsed\.data;/, "taken out before Prisma");
  assert.match(create, /parsePreorderInput\(preorder\)/);
  assert.match(create, /\.\.\.fields,\s+\.\.\.\(preorderParsed\?\.ok \? preorderSaveData\(preorderParsed\.value\) : \{\}\)/);
  assert.match(create, /preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true/, "the list the phone reads");

  const edit = read("src/app/api/supplier/products/[id]/route.ts");
  assert.match(edit, /parsePreorderInput\(preorder, new Date\(\), product\.preorderShipsAt\)/);
  assert.match(edit, /editNeedsReview\(product, parsed\.data\)/, "preorders aren't reviewed fields");
  assert.match(edit, /preorderSaveData\(preorderParsed\.value, \{ wasEnabled: product\.preorderEnabled \}\)/);

  const quick = read("src/app/api/mobile/supplier/products/[id]/route.ts");
  assert.match(quick, /preorder: PreorderInputSchema\.optional\(\)/);
  assert.match(quick, /parsePreorderInput\(input\.preorder, new Date\(\), product\.preorderShipsAt\)/);
  assert.match(quick, /preorderSaveData\(preorderParsed\.value, \{ wasEnabled: product\.preorderEnabled \}\)/);
});

test("the phone's other routes carry preorder states and order flags, never other people's raw counts", () => {
  const shared = read("src/app/api/mobile/marketplace/products/_shared.ts");
  assert.match(shared, /const \{ preorderEnabled, preorderShipsAt, preorderLimit, preorderTaken, preorderNote, \.\.\.rest \} = row;/);
  assert.match(shared, /preorder: preorderEnabled \? preorderState\(/);
  assert.match(read("src/app/api/mobile/marketplace/products/route.ts"), /\.\.\.withPreorderState\(row\)/);
  const detail = read("src/app/api/mobile/marketplace/products/[slug]/route.ts");
  assert.match(detail, /\.\.\.withPreorderState\(row\)/);
  assert.doesNotMatch(detail, /\.\.\.row,/, "the raw row (with preorderTaken) isn't spread");

  const seller = read("src/app/api/app/store-products/[id]/route.ts");
  assert.match(seller, /preorder: \{ enabled: preorderEnabled, shipsOn: preorderDay\(preorderShipsAt\), limit: preorderLimit, taken: preorderTaken, note: preorderNote \}/);
  assert.match(seller, /preorder: supplierListing\?\.preorderEnabled\s+\? preorderState\(/, "a dropship product carries the supplier's state");

  assert.match(read("src/app/api/app/orders/[id]/route.ts"), /preorder: preorderOf\(order\.items\)/);
  assert.match(read("src/app/api/app/wholesale/route.ts"), /preorder: preorder \? \{ shipsOn: preorderDay\(preorderShipsAt\) \} : null/);
  const supplier = read("src/app/api/mobile/supplier/_shared.ts");
  assert.match(supplier, /preorder: true, preorderShipsAt: true/);
  assert.match(supplier, /preorder: order\.preorder \? \{ shipsOn: preorderDay\(order\.preorderShipsAt\) \} : null/);
  assert.match(supplier, /preorder: orderHasPreorder\(order\.items\) \? \{ shipsOn: orderPreorderShipsOn\(order\.items\) \} : null/, "dropship orders too");
});

test("phone screens: product forms, Find, orders and sharing", () => {
  const seller = read("apps/mobile/src/app/product/[id].tsx");
  assert.match(seller, /<PreorderEditor value=\{preorder\}[\s\S]{0,200}audience="customers"/);
  assert.match(seller, /preorderPatch\(preorder, product\.preorder\)/);
  assert.match(seller, /\{ preorder: preorderResult\.patch \}/, "saved with the rest through PATCH /api/store/products/[id]");
  assert.match(seller, /ownDropship \?/, "dropship products get a note instead");
  assert.match(seller, /t\("preorder\.dropshipSupplier"/);
  assert.match(seller, /preorderShareText\(\{ name: product\.name/);
  assert.match(seller, /shareOnWhatsApp\(preorderShare\)/);

  const edit = read("apps/mobile/src/app/supplier/product/edit.tsx");
  assert.match(edit, /<PreorderEditor value=\{preorder\} onChange=\{setPreorder\} audience="shops"/);
  assert.match(edit, /preorderPatch\(preorder, savedFromColumns\(data\)\)/);
  const create = read("apps/mobile/src/app/supplier/product/new.tsx");
  assert.match(create, /<PreorderEditor value=\{preorder\} onChange=\{setPreorder\} audience="shops" \/>/);
  assert.match(create, /\{ preorder: preorderResult\.patch \}/);
  assert.match(read("apps/mobile/src/lib/supplier.ts"), /preorder\?: PreorderBody;/);

  const find = read("apps/mobile/src/app/find/[slug].tsx");
  assert.match(find, /<PreorderBox state=\{preorder\} \/>/);
  assert.match(find, /preorderButton\(preorder, quantity, naira\(unit \* quantity\), tp\)/);
  assert.match(find, /disabled=\{preorderCta\.disabled\}/);
  assert.match(find, /placeWholesaleOrder\(/);
  assert.match(read("apps/mobile/src/lib/marketplace.ts"), /"\/api\/app\/wholesale\/request"/);

  const box = read("apps/mobile/src/components/Preorder.tsx");
  assert.match(box, /t\("preorder\.noEscrowBuyer"\)/);
  assert.match(box, /t\("preorder\.noEscrow"\)/);
  assert.match(box, /export \{ OneLine \} from "@\/components\/ui"/, "the one-line label lives with the other button parts");
  assert.match(read("apps/mobile/src/components/ui.tsx"), /export function OneLine[\s\S]{0,300}numberOfLines=\{1\} adjustsFontSizeToFit/, "button labels stay on one line");

  assert.match(read("apps/mobile/src/app/order/[id].tsx"), /<PreorderPill preorder=\{order\.preorder/);
  assert.match(read("apps/mobile/src/app/supplier/order/[id].tsx"), /<PreorderPill preorder=\{data\.preorder\} \/>/);
  assert.match(read("apps/mobile/src/components/SupplierOrderRow.tsx"), /<PreorderPill preorder=\{preorder\} \/>/);
  assert.match(read("apps/mobile/src/app/wholesale.tsx"), /<PreorderPill preorder=\{order\.preorder\} \/>/);
});

test("Find list cards show a Preorder badge (phone and web)", () => {
  const phone = read("apps/mobile/src/app/find/index.tsx");
  assert.match(phone, /function PreorderBadge\(/);
  assert.equal((phone.match(/<PreorderBadge product=\{product\} \/>/g) ?? []).length, 2, "grid cards and the swipe card");
  const web = read("src/app/marketplace/_components/ProductGrid.tsx");
  assert.match(web, /t\("pd\.preorderFull"\)/);
  assert.match(web, /\$\{t\("pd\.preorder"\)\} · \$\{formatDate/);
});
