import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Google Maps + NIPOST digital postcodes for addresses: the offline postcode rules, directions links for riders,
// the checkout's postcode field and how a postcode prints on labels.
const postcode = await import("../shared/ng-postcode.ts");
const geo = await import("../shared/delivery-geo.ts");
const checkout = await import("../shared/cart-checkout.ts");
const labels = await import("../src/lib/labels.ts");
const settings = await import("../src/lib/seller-settings-rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("NIPOST postcodes parse however they're typed", () => {
  for (const input of ["EK-01-A03-FK-01", "EK 01 A03 FK 01", "ek01a03fk01", " ek-01 a03fk 01 "]) {
    const code = postcode.parseNgPostcode(input);
    assert.equal(code?.canonical, "EK-01-A03-FK-01", input);
    assert.equal(code?.compact, "EK01A03FK01");
    assert.equal(code?.spaced, "EK 01 A03 FK 01");
    assert.equal(code?.stateName, "Ekiti");
  }
  assert.equal(postcode.parseNgPostcode("LA-11-W06-TC-10")?.stateName, "Lagos");
  assert.equal(postcode.parseNgPostcode("FC-03-B06-AG-12")?.stateName, "Abuja FCT");
});

test("malformed postcodes and unknown states are refused", () => {
  for (const input of ["", "XYZ", "100001", "EK-00-A03-FK-01", "EK-01-A03-FK-00", "EK-01-A03-F1-01", "ZZ-01-A03-FK-01", "EK-01-A03-FK-011"]) {
    assert.equal(postcode.parseNgPostcode(input), null, input);
  }
});

test("a postcode is found inside an address and normalised for storage", () => {
  assert.equal(postcode.findNgPostcode("12 Allen Avenue, Ikeja, Lagos LA 11 W06 TC 10")?.canonical, "LA-11-W06-TC-10");
  assert.equal(postcode.findNgPostcode("12 Allen Avenue, Ikeja"), null);
  assert.equal(postcode.normalizeNgPostcode("la11w06tc10"), "LA-11-W06-TC-10");
  assert.equal(postcode.normalizeNgPostcode("100001"), "100001");
  assert.equal(postcode.normalizeNgPostcode("  "), "");
  assert.equal(postcode.normalizeNgPostcode("nope"), null);
});

test("a half-typed postcode isn't an error yet", () => {
  for (const input of ["L", "LA", "LA-1", "LA 11 W0", "LA-11-W06-T"]) assert.equal(postcode.couldBeNgPostcode(input), true, input);
  for (const input of ["1", "ZZ", "LA-A", "LA-11-W06-TC-10-9"]) assert.equal(postcode.couldBeNgPostcode(input), false, input);
});

test("geocoder state names map onto the checkout's state list", () => {
  const regions = ["Lagos", "Abuja FCT", "Rivers", "Cross River", "Niger"];
  assert.equal(postcode.matchRegion("Federal Capital Territory", regions), "Abuja FCT");
  assert.equal(postcode.matchRegion("Lagos State", regions), "Lagos");
  assert.equal(postcode.matchRegion("Rivers", regions), "Rivers");
  assert.equal(postcode.matchRegion("Niger", regions), "Niger");
  assert.equal(postcode.matchRegion("Greater Accra", regions), "");
});

test("riders get Google Maps directions to the exact pin when there is one", () => {
  assert.deepEqual(geo.addressPoint({ street: "12 Allen Ave", lat: 6.6018, lng: 3.3515 }), { lat: 6.6018, lng: 3.3515 });
  assert.equal(geo.addressPoint({ street: "12 Allen Ave" }), null);
  assert.equal(geo.addressPoint({ lat: "6.6", lng: "3.3" }), null);
  assert.equal(geo.addressPoint({ lat: 120, lng: 3.3 }), null);
  assert.equal(
    geo.directionsUrl({ point: { lat: 6.6018, lng: 3.3515 }, address: "ignored" }),
    "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=6.601800%2C3.351500",
  );
  assert.equal(geo.directionsUrl({ address: "12 Allen Ave, Ikeja" }), "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=12%20Allen%20Ave%2C%20Ikeja");
  assert.equal(geo.directionsUrl({ address: "  " }), null);
});

test("checkout: the postcode is optional, but a wrong one is caught in Nigeria only", () => {
  const rules = { requirePhone: false, requireState: false, deliveryOptionIds: [], paymentMethods: ["transfer"] };
  const details = { name: "Ada", email: "ada@example.com", phone: "", street: "12 Allen Ave", city: "Ikeja", state: "Lagos", country: "Nigeria", landmark: "" };
  assert.equal(checkout.stepErrors("delivery", details, rules).postcode, undefined);
  assert.equal(checkout.stepErrors("delivery", { ...details, postcode: "LA-11-W06-TC-10" }, rules).postcode, undefined);
  assert.equal(checkout.stepErrors("delivery", { ...details, postcode: "100001" }, rules).postcode, undefined);
  assert.match(checkout.stepErrors("delivery", { ...details, postcode: "LA-11" }, rules).postcode ?? "", /LA-11-W06-TC-10/);
  assert.equal(checkout.stepErrors("delivery", { ...details, country: "Ghana", postcode: "GA-123-4567" }, rules).postcode, undefined);
});

test("checkout: the postcode and pin are remembered on the device, junk isn't", () => {
  assert.deepEqual(checkout.sanitizeSavedDetails({ postcode: "LA-11-W06-TC-10", lat: 6.6, lng: 3.35 }), { postcode: "LA-11-W06-TC-10", lat: 6.6, lng: 3.35 });
  assert.deepEqual(checkout.sanitizeSavedDetails({ lat: "6.6", lng: 3.35 }), {});
  assert.deepEqual(checkout.sanitizeSavedDetails({ lat: 600, lng: 3.35 }), {});
});

test("labels print the postcode spaced, as NIPOST shows it", () => {
  assert.deepEqual(labels.addressLines({ street: "12 Allen Ave", city: "Ikeja", state: "Lagos", country: "NG", postalCode: "LA-11-W06-TC-10" }), ["12 Allen Ave", "Ikeja, Lagos", "LA 11 W06 TC 10"]);
  assert.deepEqual(labels.addressLines({ street: "12 Allen Ave", city: "Ikeja", postalCode: "100001" }), ["12 Allen Ave", "Ikeja", "100001"]);
});

test("the business address keeps a postcode in NIPOST's form", () => {
  assert.equal(settings.cleanBusinessAddress({ postalCode: "la 11 w06 tc10" }).postalCode, "LA-11-W06-TC-10");
  assert.equal(settings.cleanBusinessAddress({ postalCode: "100001" }).postalCode, "100001");
});

test("keys stay on the server and lookups are limited and same-origin", () => {
  const nipost = read("src/lib/geo/nipost.server.ts");
  assert.match(nipost, /import "server-only"/);
  assert.match(nipost, /"X-API-Key": key/);
  assert.match(nipost, /redirect: "manual"/);
  const google = read("src/lib/geo/google-maps.server.ts");
  assert.match(google, /import "server-only"/);
  assert.doesNotMatch(read("src/components/geo/useAddressLookup.ts"), /GOOGLE_MAPS_API_KEY|NIPOST_API_KEY/);
  for (const route of ["suggest", "place", "reverse", "postcode", "map"]) {
    const source = read(`src/app/api/public/geo/${route}/route.ts`);
    assert.match(source, /limited\(req\)/, route);
    assert.doesNotMatch(source, /withCors/, route);
  }
  assert.match(read("src/lib/rate-limit.ts"), /address: \{\},/);
  assert.match(read("next.config.ts"), /geolocation=\(self\)/);
});

test("portal address forms keep a pin only for the address it was picked for", async () => {
  const { addressFromForm } = await import("../src/lib/geo/form-address.ts");
  const form = (fields) => ({ get: (name) => fields[name] ?? null, has: (name) => name in fields });
  assert.equal(addressFromForm(form({ city: "Lagos" })), null);
  assert.deepEqual(addressFromForm(form({ address: "12 Allen Ave", postcode: "la11w06tc10", addressLat: "6.6018", addressLng: "3.3515", addressPinFor: "12 Allen Ave" })), {
    address: "12 Allen Ave", postcode: "LA-11-W06-TC-10", addressLat: 6.6018, addressLng: 3.3515,
  });
  // Edited by hand after picking: the old pin is dropped.
  assert.deepEqual(addressFromForm(form({ address: "14 Allen Ave", postcode: "", addressLat: "6.6018", addressLng: "3.3515", addressPinFor: "12 Allen Ave" })), {
    address: "14 Allen Ave", postcode: null, addressLat: null, addressLng: null,
  });
  assert.match(addressFromForm(form({ address: "12 Allen Ave", postcode: "LA-11" })).error, /LA-11-W06-TC-10/);
  assert.equal(addressFromForm(form({ address: "1 Ring Rd", postcode: "GA-123-4567" }), { nigeria: false }).postcode, "GA-123-4567");
});

test("partner systems get the job's points and postcodes", async () => {
  const { partnerJob } = await import("../src/lib/logistics/partner-api-core.ts");
  const base = { id: "j1", status: "pending", pickupLocation: "A", destination: "B", packageDetails: {}, deliveryFee: 2000, currency: "NGN", codAmount: null, trackingCode: null, createdAt: new Date("2026-10-16T10:00:00Z") };
  const job = partnerJob({ ...base, pickupLat: 6.45, pickupLng: 3.4, pickupPostcode: "LA-01-A01-AA-01", dropoffLat: 6.6, dropoffLng: 3.35, dropoffPostcode: "LA-11-W06-TC-10" });
  assert.deepEqual(job.pickupPoint, { lat: 6.45, lng: 3.4 });
  assert.deepEqual(job.destinationPoint, { lat: 6.6, lng: 3.35 });
  assert.equal(job.destinationPostcode, "LA-11-W06-TC-10");
  const bare = partnerJob(base);
  assert.equal(bare.pickupPoint, null);
  assert.equal(bare.destinationPoint, null);
});

test("every booking creation path saves pickup and drop-off points", () => {
  for (const path of ["src/lib/logistics/booking.server.ts", "src/app/api/app/logistics/bookings/route.ts", "src/app/api/app/logistics/quotes/[id]/accept/route.ts"]) {
    assert.match(read(path), /bookingGeoFields\(/, path);
  }
  assert.match(read("docs/migrations/2026-11-06-address-pins.sql"), /"dropoffLat" DOUBLE PRECISION/);
});
