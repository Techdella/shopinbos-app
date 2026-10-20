// Nigerian LGA list (shared/ng-lgas.ts): all 774 LGAs with the official per-state counts, keyed like NG_STATES,
// and the lookups used by the LGA pickers and coverage matching.
import test from "node:test";
import assert from "node:assert/strict";

const l = await import("../shared/ng-lgas.ts");
const { NG_STATES } = await import("../shared/delivery-market.ts");

const COUNTS = {
  Abia: 17, Adamawa: 21, "Akwa Ibom": 31, Anambra: 21, Bauchi: 20, Bayelsa: 8, Benue: 23, Borno: 27, "Cross River": 18,
  Delta: 25, Ebonyi: 13, Edo: 18, Ekiti: 16, Enugu: 17, FCT: 6, Gombe: 11, Imo: 27, Jigawa: 27, Kaduna: 23, Kano: 44,
  Katsina: 34, Kebbi: 21, Kogi: 21, Kwara: 16, Lagos: 20, Nasarawa: 13, Niger: 25, Ogun: 20, Ondo: 18, Osun: 30, Oyo: 33,
  Plateau: 17, Rivers: 23, Sokoto: 23, Taraba: 16, Yobe: 17, Zamfara: 14,
};

test("ng-lgas: 774 LGAs, official count per state, keyed exactly like NG_STATES", () => {
  assert.deepEqual(Object.keys(l.NG_LGAS).sort(), [...NG_STATES].sort());
  const total = Object.values(l.NG_LGAS).reduce((sum, list) => sum + list.length, 0);
  assert.equal(total, 774);
  for (const [state, count] of Object.entries(COUNTS)) assert.equal(l.NG_LGAS[state].length, count, state);
  assert.equal(Object.values(COUNTS).reduce((a, b) => a + b, 0), 774);
});

test("ng-lgas: no duplicates (even ignoring case/punctuation) and tidy names", () => {
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [state, list] of Object.entries(l.NG_LGAS)) {
    assert.equal(new Set(list.map(key)).size, list.length, state);
    for (const name of list) assert.equal(name, name.trim().replace(/\s+/g, " "), `${state}: ${name}`);
  }
  assert.deepEqual(l.NG_LGAS.Lagos, [
    "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki",
    "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo",
    "Shomolu", "Surulere",
  ]);
});

test("ng-lgas: lgasOf takes state names the way people write them", () => {
  assert.equal(l.lgasOf("Lagos").length, 20);
  assert.equal(l.lgasOf("lagos state").length, 20);
  assert.equal(l.lgasOf("Abuja").length, 6);
  assert.equal(l.lgasOf("akwa-ibom").length, 31);
  assert.deepEqual(l.lgasOf("Atlantis"), []);
  assert.deepEqual(l.lgasOf(null), []);
});

test("ng-lgas: findLga ignores case, hyphens and spaces and knows common short forms", () => {
  assert.equal(l.findLga("Lagos", "Eti Osa"), "Eti-Osa");
  assert.equal(l.findLga("Lagos", "ETI-OSA"), "Eti-Osa");
  assert.equal(l.findLga("Lagos", "etiosa"), "Eti-Osa");
  assert.equal(l.findLga("Lagos", "Oshodi"), "Oshodi-Isolo");
  assert.equal(l.findLga("Lagos", "Isolo"), "Oshodi-Isolo");
  assert.equal(l.findLga("Lagos", "Somolu"), "Shomolu");
  assert.equal(l.findLga("Lagos", "Ikeja LGA"), "Ikeja");
  assert.equal(l.findLga("lagos state", "ibeju lekki"), "Ibeju-Lekki");
  assert.equal(l.findLga("FCT", "AMAC"), "Municipal Area Council");
  assert.equal(l.findLga("Abuja", "municipal area council"), "Municipal Area Council");
  assert.equal(l.findLga("Rivers", "Obio Akpor"), "Obio/Akpor");
  assert.equal(l.findLga("Bauchi", "Jamaare"), "Jama'are");
  assert.equal(l.findLga("Lagos", "Lekki"), null, "a city, not an LGA name");
  assert.equal(l.findLga("Kano", "Eti-Osa"), null, "wrong state");
  assert.equal(l.findLga("Atlantis", "Ikeja"), null);
  assert.equal(l.findLga("Lagos", ""), null);
});

test("ng-lgas: common areas and address lines resolve to their LGA", () => {
  for (const [state, areas] of Object.entries(l.COMMON_AREAS)) {
    for (const [area, lga] of Object.entries(areas)) {
      assert.ok(l.NG_LGAS[state].includes(lga), `${state}: ${area} → ${lga}`);
      assert.equal(l.lgaOfArea(state, area), lga, `${state}: ${area}`);
    }
  }
  assert.equal(l.lgaOfArea("Lagos", "Lekki"), "Eti-Osa");
  assert.equal(l.lgaOfArea("Lagos", "Lekki Phase 1"), "Eti-Osa");
  assert.equal(l.lgaOfArea("Lagos", "Ibeju Lekki"), "Ibeju-Lekki");
  assert.equal(l.lgaOfArea("Lagos", "Yaba"), "Lagos Mainland");
  assert.equal(l.lgaOfArea("Lagos", "Ikeja GRA"), "Ikeja");
  assert.equal(l.lgaOfArea("FCT", "Plot 4, Wuse 2"), "Municipal Area Council");
  assert.equal(l.lgaOfArea("FCT", "Kubwa"), "Bwari");
  assert.equal(l.lgaOfArea("Rivers", "GRA"), "Port Harcourt");
  assert.equal(l.lgaOfArea("Lagos", "Atlantis"), null);
  assert.equal(l.lgaOfArea("Kano", "Lekki"), null);
});

test("ng-lgas: areaSuggestions lists the LGAs and common areas once each", () => {
  const lagos = l.areaSuggestions("Lagos");
  assert.ok(lagos.includes("Eti-Osa") && lagos.includes("Lekki") && lagos.includes("Yaba"));
  assert.equal(new Set(lagos).size, lagos.length);
  assert.deepEqual(l.areaSuggestions("Kebbi"), [...l.NG_LGAS.Kebbi].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(l.areaSuggestions(""), []);
});
