// The gazetteer Peggy uses on calls (shared/ng-places.ts): the main cities and their neighbourhoods, each mapped to
// its state and a real LGA, and how what someone says becomes coverage tokens.
import test from "node:test";
import assert from "node:assert/strict";

const places = await import("../shared/ng-places.ts");
const lgas = await import("../shared/ng-lgas.ts");
const market = await import("../shared/delivery-market.ts");

test("every city and neighbourhood maps to a real state and LGA", () => {
  for (const city of places.NG_CITIES) {
    const known = lgas.NG_LGAS[city.state];
    assert.ok(known, `${city.name}: state ${city.state}`);
    assert.ok(city.lgas.length, `${city.name}: has LGAs`);
    for (const lga of city.lgas) assert.ok(known.includes(lga), `${city.name}: LGA ${lga}`);
    for (const [area, lga] of Object.entries(city.areas)) assert.ok(known.includes(lga), `${city.name} › ${area}: LGA ${lga}`);
  }
});

test("the cities the owner asked for are all there, with neighbourhoods", () => {
  const wanted = ["Lagos Island", "Lagos Mainland", "Ibadan", "Abeokuta", "Ijebu-Ode", "Sagamu", "Ota", "Abuja", "Port Harcourt", "Benin City", "Enugu", "Onitsha", "Aba", "Owerri", "Kano", "Kaduna", "Jos", "Ilorin", "Osogbo", "Ile-Ife", "Akure", "Ado-Ekiti", "Warri", "Asaba", "Calabar", "Uyo"];
  for (const name of wanted) {
    const city = places.NG_CITIES.find((entry) => entry.name === name);
    assert.ok(city, name);
    assert.ok(Object.keys(city.areas).length >= 3, `${name}: neighbourhoods`);
  }
  const abeokuta = places.areasOfCity("abeokuta")[0];
  for (const area of ["Lafenwa", "Kuto", "Oke-Ilewo", "Ibara", "Panseke", "Adatan", "Isale-Ake"]) assert.ok(abeokuta.areas.includes(area), area);
  assert.equal(abeokuta.state, "Ogun");
});

test("a city with its neighbourhoods saves as State: Area tokens", () => {
  const result = places.coverageFrom({ city: "Abeokuta", areas: ["Lafenwa", "kuto"] });
  assert.deepEqual(result.tokens, ["Ogun: Lafenwa", "Ogun: Kuto"]);
  assert.equal(result.label, "Abeokuta – Lafenwa, Kuto");
  assert.deepEqual(result.unknown, []);
  // The tokens match customer addresses in those neighbourhoods, and not elsewhere in Ogun.
  assert.ok(market.covers(result.tokens, { state: "Ogun", area: "12 Lafenwa Road, Lafenwa" }));
  assert.ok(!market.covers(result.tokens, { state: "Ogun", area: "Sango Ota" }));
});

test("a city on its own is all of its LGAs; a state alone is the state", () => {
  const whole = places.coverageFrom({ city: "Ibadan" });
  assert.ok(whole.tokens.includes("Oyo: Ibadan North"));
  assert.ok(whole.tokens.every((token) => token.startsWith("Oyo: ")));
  assert.match(whole.label, /Ibadan \(all areas\)/);
  assert.deepEqual(places.coverageFrom({ state: "ogun state" }).tokens, ["Ogun"]);
  assert.deepEqual(places.coverageFrom({ areas: ["Lagos"] }).tokens, ["Lagos"]);
});

test("aliases, LGAs and places we don't know", () => {
  assert.equal(places.findCities("PH")[0]?.name, "Port Harcourt");
  assert.equal(places.findCities("shagamu")[0]?.name, "Sagamu");
  assert.equal(places.placeArea("Ikeja", { state: "Lagos" })?.token, "Lagos: Ikeja");
  assert.equal(places.placeArea("Abeokuta South", { state: "Ogun" })?.token, "Ogun: Abeokuta South");
  assert.equal(places.placeArea("Woji", { city: "Port Harcourt" })?.lga, "Obio/Akpor");
  // "GRA" is in many cities: only placed with a city.
  assert.equal(places.placeArea("GRA"), null);
  assert.equal(places.placeArea("GRA", { city: "Benin" })?.token, "Edo: GRA");
  assert.deepEqual(places.coverageFrom({ city: "Lagos", areas: ["Yaba", "Atlantis"] }), { tokens: ["Lagos: Yaba"], label: "Lagos – Yaba", unknown: ["Atlantis"] });
});

test("prompt lists stay small: the areas for the caller's states, every city in one line", () => {
  const ogun = places.areasText(["Ogun"]);
  assert.match(ogun, /^Abeokuta \(Ogun\): .*Lafenwa/m);
  assert.doesNotMatch(ogun, /Ibadan/);
  assert.ok(places.citiesText().length < 1200);
  assert.ok(places.areasText(places.NG_CITIES.map((city) => city.state)).length < 6000);
});
