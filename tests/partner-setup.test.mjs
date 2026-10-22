// Delivery partner set-up, shared by the web set-up and the phone app's (shared/partner-setup.ts): coverage choices
// as area tokens, the starter rate card, and the zone names the older onboarding call still needs.
import test from "node:test";
import assert from "node:assert/strict";

const s = await import("../shared/partner-setup.ts");
const { validateRateCard } = await import("../shared/delivery-market.ts");

test("legacy zones stay inside the free plan's 3 coverage states", () => {
  assert.deepEqual(s.legacyZonesFor(["Lagos", "Ogun", "Oyo", "Kano", "Abia"]), ["Lagos", "Ogun", "Oyo"]);
  assert.deepEqual(s.legacyZonesFor(["FCT"]), ["FCT"]);
  assert.deepEqual(s.legacyZonesFor([]), ["Lagos"]);
});

test("coverage choices become area tokens and read back the same", () => {
  assert.deepEqual(s.deliveryAreasFor("all", ["Lagos"], []), ["Nationwide"]);
  assert.deepEqual(s.deliveryAreasFor("same", ["Lagos", "Ogun"], []), ["Lagos", "Ogun"]);
  // Finer tokens already saved are kept when picking states.
  assert.deepEqual(s.deliveryAreasFor("some", ["Lagos"], ["Oyo"], ["Lagos: Ikeja", "Kano"]), ["Oyo", "Lagos: Ikeja"]);
  assert.deepEqual(s.pickupAreasFor(["Lagos"], ["Ogun", "Lagos: Lekki"]), ["Lagos", "Lagos: Lekki"]);
  assert.equal(s.deliverModeOf(["Lagos"], ["Nationwide"]), "all");
  assert.equal(s.deliverModeOf(["Lagos", "Ogun"], ["Ogun", "Lagos"]), "same");
  assert.equal(s.deliverModeOf(["Lagos"], ["Oyo"]), "some");
});

test("the starter rate card validates once prices are typed", () => {
  const rows = s.starterRates(["Lagos"], "all", [], ["doorstep", "same_day"]);
  assert.deepEqual(rows.map((row) => `${row.from}>${row.to}:${row.service}:${row.minDays}-${row.maxDays}`), ["Lagos>Lagos:doorstep:1-2", "Lagos>Nationwide:doorstep:2-4", "Lagos>Lagos:same_day:0-0"]);
  assert.deepEqual(s.rowsToSave(rows), [], "empty prices are left out");
  const priced = s.rowsToSave(rows.map((row) => ({ ...row, price: "2,500" })));
  assert.equal(priced.length, 3);
  assert.equal(priced[0].price, 2500);
  assert.equal(validateRateCard({ rows: priced }).ok, true);
});
