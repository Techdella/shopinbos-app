// A small gazetteer of Nigeria's main cities and their well-known neighbourhoods, each mapped to its state and LGA
// (LGA names exactly as in ./ng-lgas.ts). Peggy uses it on calls: when someone names a city she asks which areas,
// and what she saves becomes proper coverage tokens ("Ogun: Lafenwa", or "Ogun: Abeokuta South" for a whole LGA),
// the same "State: Area" tokens shared/delivery-market.ts matches against customer addresses.
// Pure (its only import is the LGA list), unit-tested in tests/ng-places.test.mjs.

import { findLga, type NgLgaState } from "./ng-lgas.ts";

export interface NgCity {
  /** The name people say ("Abeokuta"). */
  name: string;
  state: NgLgaState;
  /** Other ways it's said or written. */
  aliases?: readonly string[];
  /** The LGAs the city covers: a whole-city choice saves these. */
  lgas: readonly string[];
  /** Well-known neighbourhoods and areas → the LGA each is in. */
  areas: Readonly<Record<string, string>>;
}

export const NG_CITIES: readonly NgCity[] = [
  {
    name: "Lagos Island",
    state: "Lagos",
    aliases: ["the island", "island"],
    lgas: ["Lagos Island", "Eti-Osa", "Ibeju-Lekki"],
    areas: {
      Lekki: "Eti-Osa", "Lekki Phase 1": "Eti-Osa", "Victoria Island": "Eti-Osa", Ikoyi: "Eti-Osa", Ajah: "Eti-Osa", Oniru: "Eti-Osa",
      Ikota: "Eti-Osa", Chevron: "Eti-Osa", Osapa: "Eti-Osa", Agungi: "Eti-Osa", Sangotedo: "Eti-Osa", Badore: "Eti-Osa",
      Jakande: "Eti-Osa", Obalende: "Eti-Osa", Awoyaya: "Ibeju-Lekki", Lakowe: "Ibeju-Lekki", Eleko: "Ibeju-Lekki",
      Idumota: "Lagos Island", Marina: "Lagos Island", "Isale Eko": "Lagos Island", "Broad Street": "Lagos Island", Onikan: "Lagos Island",
    },
  },
  {
    name: "Lagos Mainland",
    state: "Lagos",
    aliases: ["mainland", "the mainland"],
    lgas: ["Lagos Mainland", "Surulere", "Ikeja", "Kosofe", "Shomolu", "Mushin", "Oshodi-Isolo", "Alimosho", "Agege", "Ifako-Ijaiye", "Amuwo-Odofin", "Apapa", "Ajeromi-Ifelodun", "Ojo", "Ikorodu"],
    areas: {
      Yaba: "Lagos Mainland", "Ebute Metta": "Lagos Mainland", Oyingbo: "Lagos Mainland", Surulere: "Surulere", Aguda: "Surulere",
      Ojuelegba: "Surulere", Itire: "Surulere", Lawanson: "Surulere", Ikeja: "Ikeja", "Ikeja GRA": "Ikeja", "Allen Avenue": "Ikeja",
      Opebi: "Ikeja", Alausa: "Ikeja", Oregun: "Ikeja", Ogba: "Ikeja", Ojodu: "Ikeja", Omole: "Ikeja", "Computer Village": "Ikeja",
      Maryland: "Kosofe", Gbagada: "Kosofe", Ketu: "Kosofe", Ojota: "Kosofe", Ogudu: "Kosofe", "Mile 12": "Kosofe", "Anthony Village": "Kosofe",
      Bariga: "Shomolu", Shomolu: "Shomolu", Mushin: "Mushin", "Idi-Araba": "Mushin", "Papa Ajao": "Mushin", Oshodi: "Oshodi-Isolo",
      Isolo: "Oshodi-Isolo", Okota: "Oshodi-Isolo", Ejigbo: "Oshodi-Isolo", "Ajao Estate": "Oshodi-Isolo", Egbeda: "Alimosho",
      Idimu: "Alimosho", Ikotun: "Alimosho", Igando: "Alimosho", Ipaja: "Alimosho", "Iyana Ipaja": "Alimosho", Akowonjo: "Alimosho",
      Ayobo: "Alimosho", Agege: "Agege", Dopemu: "Agege", Iju: "Ifako-Ijaiye", Ifako: "Ifako-Ijaiye", Festac: "Amuwo-Odofin",
      "Mile 2": "Amuwo-Odofin", "Satellite Town": "Amuwo-Odofin", Apapa: "Apapa", Ajegunle: "Ajeromi-Ifelodun", Ojo: "Ojo",
      Alaba: "Ojo", Iba: "Ojo", Okokomaiko: "Ojo", Ikorodu: "Ikorodu", Igbogbo: "Ikorodu",
    },
  },
  {
    name: "Ibadan",
    state: "Oyo",
    lgas: ["Ibadan North", "Ibadan North-East", "Ibadan North-West", "Ibadan South-East", "Ibadan South-West", "Akinyele", "Egbeda", "Ido", "Lagelu", "Oluyole", "Ona Ara"],
    areas: {
      Bodija: "Ibadan North", Agodi: "Ibadan North", Sango: "Ibadan North", UI: "Ibadan North", Mokola: "Ibadan North", Agbowo: "Ibadan North",
      Samonda: "Ibadan North", Secretariat: "Ibadan North", "Idi-Ishin": "Ibadan North", Onireke: "Ibadan North-West", Eleyele: "Ibadan North-West",
      Dugbe: "Ibadan North-West", "Ring Road": "Ibadan South-West", "Oke-Ado": "Ibadan South-West", Molete: "Ibadan South-West",
      Iyaganku: "Ibadan South-West", "Oluyole Estate": "Ibadan South-West", Mapo: "Ibadan South-East", "Oja Oba": "Ibadan South-East",
      "Iwo Road": "Ibadan North-East", Agugu: "Ibadan North-East", Basorun: "Ibadan North-East", Moniya: "Akinyele", Ojoo: "Akinyele",
      Egbeda: "Egbeda", Apete: "Ido", Akobo: "Lagelu", Challenge: "Oluyole",
    },
  },
  {
    name: "Abeokuta",
    state: "Ogun",
    lgas: ["Abeokuta South", "Abeokuta North", "Odeda", "Obafemi Owode"],
    areas: {
      Kuto: "Abeokuta South", "Oke-Ilewo": "Abeokuta South", Ibara: "Abeokuta South", "Ibara Housing": "Abeokuta South", "Isale-Ake": "Abeokuta South",
      Ake: "Abeokuta South", Itoku: "Abeokuta South", Panseke: "Abeokuta South", Adatan: "Abeokuta South", Sapon: "Abeokuta South",
      Ijemo: "Abeokuta South", "Oke-Mosan": "Abeokuta South", Onikolobo: "Abeokuta South", Lafenwa: "Abeokuta North", Totoro: "Abeokuta North",
      "Ita-Oshin": "Abeokuta North", Olomore: "Abeokuta North", Iberekodo: "Abeokuta North", Alabata: "Odeda", Odeda: "Odeda",
    },
  },
  {
    name: "Ijebu-Ode",
    state: "Ogun",
    aliases: ["ijebu ode", "ijebu"],
    lgas: ["Ijebu Ode"],
    areas: { Molipa: "Ijebu Ode", "Ita-Osu": "Ijebu Ode", Igbeba: "Ijebu Ode", "Oke-Aje": "Ijebu Ode", Porogun: "Ijebu Ode", Ijasi: "Ijebu Ode", Itantebo: "Ijebu Ode" },
  },
  {
    name: "Sagamu",
    state: "Ogun",
    aliases: ["shagamu"],
    lgas: ["Sagamu"],
    areas: { Makun: "Sagamu", Sabo: "Sagamu", "Isale Oko": "Sagamu", Ijoku: "Sagamu", Ofin: "Sagamu" },
  },
  {
    name: "Ota",
    state: "Ogun",
    aliases: ["sango ota", "sango-ota"],
    lgas: ["Ado-Odo/Ota", "Ifo"],
    areas: { "Sango Ota": "Ado-Odo/Ota", "Iyana Iyesi": "Ado-Odo/Ota", "Canaan Land": "Ado-Odo/Ota", Atan: "Ado-Odo/Ota", Joju: "Ado-Odo/Ota", Ijoko: "Ifo", Akute: "Ifo", Ifo: "Ifo" },
  },
  {
    name: "Abuja",
    state: "FCT",
    aliases: ["fct", "abuja fct"],
    lgas: ["Municipal Area Council", "Bwari", "Gwagwalada", "Kuje"],
    areas: {
      Wuse: "Municipal Area Council", "Wuse 2": "Municipal Area Council", Garki: "Municipal Area Council", Maitama: "Municipal Area Council",
      Asokoro: "Municipal Area Council", Jabi: "Municipal Area Council", Utako: "Municipal Area Council", Gwarinpa: "Municipal Area Council",
      Wuye: "Municipal Area Council", "Central Business District": "Municipal Area Council", Lugbe: "Municipal Area Council",
      "Life Camp": "Municipal Area Council", Katampe: "Municipal Area Council", Durumi: "Municipal Area Council", Apo: "Municipal Area Council",
      Lokogoma: "Municipal Area Council", Galadimawa: "Municipal Area Council", Gudu: "Municipal Area Council", Kado: "Municipal Area Council",
      Mabushi: "Municipal Area Council", Jahi: "Municipal Area Council", Nyanya: "Municipal Area Council", Karu: "Municipal Area Council",
      Kurudu: "Municipal Area Council", Kubwa: "Bwari", Dutse: "Bwari", Dawaki: "Bwari", Bwari: "Bwari", Gwagwalada: "Gwagwalada", Kuje: "Kuje",
    },
  },
  {
    name: "Port Harcourt",
    state: "Rivers",
    aliases: ["ph", "phc", "portharcourt"],
    lgas: ["Port Harcourt", "Obio/Akpor", "Eleme", "Oyigbo"],
    areas: {
      GRA: "Port Harcourt", "Old GRA": "Port Harcourt", "D-Line": "Port Harcourt", Diobu: "Port Harcourt", "Mile 1": "Port Harcourt",
      "Mile 3": "Port Harcourt", Borokiri: "Port Harcourt", Rumuokoro: "Obio/Akpor", Rumuola: "Obio/Akpor",
      Choba: "Obio/Akpor", Rumuokwuta: "Obio/Akpor", Rumuibekwe: "Obio/Akpor", Woji: "Obio/Akpor", "Trans-Amadi": "Obio/Akpor",
      "Ada George": "Obio/Akpor", Rumuigbo: "Obio/Akpor", Eliozu: "Obio/Akpor", Alakahia: "Obio/Akpor", Rumuomasi: "Obio/Akpor",
      Elelenwo: "Obio/Akpor", Onne: "Eleme", Alesa: "Eleme", Oyigbo: "Oyigbo",
    },
  },
  {
    name: "Benin City",
    state: "Edo",
    aliases: ["benin"],
    lgas: ["Oredo", "Egor", "Ikpoba Okha", "Ovia North-East"],
    areas: {
      "Ring Road": "Oredo", GRA: "Oredo", "Sapele Road": "Oredo", Ugbor: "Oredo", "New Benin": "Oredo", Uselu: "Egor", Ugbowo: "Egor",
      Uwelu: "Egor", "Ikpoba Hill": "Ikpoba Okha", Aduwawa: "Ikpoba Okha", Ekosodin: "Ovia North-East",
    },
  },
  {
    name: "Enugu",
    state: "Enugu",
    lgas: ["Enugu North", "Enugu South", "Enugu East"],
    areas: {
      "Independence Layout": "Enugu North", GRA: "Enugu North", Ogui: "Enugu North", "Coal Camp": "Enugu North", Asata: "Enugu North",
      "New Haven": "Enugu East", "Trans-Ekulu": "Enugu East", "Abakpa Nike": "Enugu East", Emene: "Enugu East", Uwani: "Enugu South",
      "Achara Layout": "Enugu South", Maryland: "Enugu South", Gariki: "Enugu South", Awkunanaw: "Enugu South",
    },
  },
  {
    name: "Onitsha",
    state: "Anambra",
    lgas: ["Onitsha North", "Onitsha South", "Idemili North", "Ogbaru"],
    areas: {
      "Main Market": "Onitsha North", GRA: "Onitsha North", "Inland Town": "Onitsha North", Odoakpu: "Onitsha South", Fegge: "Onitsha South",
      Awada: "Idemili North", Obosi: "Idemili North", Nkpor: "Idemili North", Okpoko: "Ogbaru",
    },
  },
  {
    name: "Aba",
    state: "Abia",
    lgas: ["Aba North", "Aba South", "Osisioma", "Obi Ngwa"],
    areas: { Ariaria: "Aba North", "Ogbor Hill": "Aba North", Eziukwu: "Aba North", "Asa Road": "Aba South", "Ngwa Road": "Aba South", "Eke Oha": "Aba South", Osisioma: "Osisioma", Abayi: "Osisioma" },
  },
  {
    name: "Owerri",
    state: "Imo",
    lgas: ["Owerri Municipal", "Owerri North", "Owerri West"],
    areas: {
      Ikenegbu: "Owerri Municipal", "Wetheral Road": "Owerri Municipal", "Douglas Road": "Owerri Municipal", "World Bank": "Owerri North",
      Amakohia: "Owerri North", Orji: "Owerri North", Egbu: "Owerri North", Umuguma: "Owerri West", Nekede: "Owerri West", Ihiagwa: "Owerri West", Avu: "Owerri West",
    },
  },
  {
    name: "Kano",
    state: "Kano",
    lgas: ["Kano Municipal", "Fagge", "Gwale", "Dala", "Nasarawa", "Tarauni", "Ungogo", "Kumbotso"],
    areas: {
      "Sabon Gari": "Fagge", Fagge: "Fagge", "Nassarawa GRA": "Nasarawa", Bompai: "Nasarawa", Hotoro: "Nasarawa", "Kurmi Market": "Kano Municipal",
      Gwale: "Gwale", Kabuga: "Gwale", Dala: "Dala", Tarauni: "Tarauni", "Zoo Road": "Tarauni", "Gyadi-Gyadi": "Tarauni", Naibawa: "Kumbotso", Ungogo: "Ungogo",
    },
  },
  {
    name: "Kaduna",
    state: "Kaduna",
    lgas: ["Kaduna North", "Kaduna South", "Chikun", "Igabi"],
    areas: {
      Barnawa: "Kaduna South", Kakuri: "Kaduna South", "Tudun Wada": "Kaduna South", Kabala: "Kaduna South", "Sabon Tasha": "Chikun", Narayi: "Chikun",
      "Ungwan Rimi": "Kaduna North", Malali: "Kaduna North", Kawo: "Kaduna North", "Unguwan Dosa": "Kaduna North", Badiko: "Kaduna North",
      Rigasa: "Igabi", Mando: "Igabi",
    },
  },
  {
    name: "Jos",
    state: "Plateau",
    lgas: ["Jos North", "Jos South", "Jos East"],
    areas: { Terminus: "Jos North", "Angwan Rogo": "Jos North", "Tudun Wada": "Jos North", Rayfield: "Jos South", Bukuru: "Jos South", Vom: "Jos South" },
  },
  {
    name: "Ilorin",
    state: "Kwara",
    lgas: ["Ilorin West", "Ilorin East", "Ilorin South"],
    areas: { GRA: "Ilorin West", "Taiwo Road": "Ilorin West", "Post Office": "Ilorin West", "Oja Oba": "Ilorin West", Adewole: "Ilorin West", Tanke: "Ilorin South", Fate: "Ilorin South", "Oke-Oyi": "Ilorin East" },
  },
  {
    name: "Osogbo",
    state: "Osun",
    aliases: ["oshogbo"],
    lgas: ["Osogbo", "Olorunda"],
    areas: { "Oke-Fia": "Osogbo", Alekuwodo: "Osogbo", "Ogo Oluwa": "Osogbo", "Oke-Baale": "Osogbo", Igbona: "Olorunda" },
  },
  {
    name: "Ile-Ife",
    state: "Osun",
    aliases: ["ife", "ile ife"],
    lgas: ["Ife Central", "Ife East"],
    areas: { OAU: "Ife Central", Mayfair: "Ife Central", Lagere: "Ife Central", Sabo: "Ife Central", Modakeke: "Ife East" },
  },
  {
    name: "Akure",
    state: "Ondo",
    lgas: ["Akure South", "Akure North"],
    areas: { Alagbaka: "Akure South", Ijapo: "Akure South", "Oke-Aro": "Akure South", Oyemekun: "Akure South", Isikan: "Akure South", FUTA: "Akure South", "Shagari Village": "Akure South", "Oba-Ile": "Akure North", Iju: "Akure North" },
  },
  {
    name: "Ado-Ekiti",
    state: "Ekiti",
    aliases: ["ado ekiti", "ado"],
    lgas: ["Ado Ekiti"],
    areas: { Ajilosun: "Ado Ekiti", Okesa: "Ado Ekiti", Basiri: "Ado Ekiti", "Oke-Ila": "Ado Ekiti", Adebayo: "Ado Ekiti", "Odo-Ado": "Ado Ekiti", Fajuyi: "Ado Ekiti" },
  },
  {
    name: "Warri",
    state: "Delta",
    lgas: ["Warri South", "Uvwie"],
    areas: { Effurun: "Uvwie", Ekpan: "Uvwie", Enerhen: "Uvwie", "Airport Road": "Uvwie", Jakpa: "Uvwie", "PTI Road": "Uvwie", Okumagba: "Warri South", GRA: "Warri South", Ugbuwangue: "Warri South", Okere: "Warri South" },
  },
  {
    name: "Asaba",
    state: "Delta",
    lgas: ["Oshimili South", "Oshimili North"],
    areas: { "Cable Point": "Oshimili South", GRA: "Oshimili South", Okwe: "Oshimili South", "Nnebisi Road": "Oshimili South", Okpanam: "Oshimili North", Ibusa: "Oshimili North" },
  },
  {
    name: "Calabar",
    state: "Cross River",
    lgas: ["Calabar Municipal", "Calabar South"],
    areas: { Marian: "Calabar Municipal", "Ikot Ansa": "Calabar Municipal", "Ikot Ishie": "Calabar Municipal", "Diamond Hill": "Calabar Municipal", "State Housing": "Calabar Municipal", "Watt Market": "Calabar South", "Henshaw Town": "Calabar South", Anantigha: "Calabar South" },
  },
  {
    name: "Uyo",
    state: "Akwa Ibom",
    lgas: ["Uyo"],
    areas: { "Ewet Housing": "Uyo", "Shelter Afrique": "Uyo", "Oron Road": "Uyo", "Aka Road": "Uyo", "Use Offot": "Uyo", "Ikot Ekpene Road": "Uyo", "Abak Road": "Uyo" },
  },
];

/** Lower case, accents and punctuation gone, no spaces ("Oke-Ilewo" → "okeilewo"). */
const key = (text: string | null | undefined) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(state|city|town|area|lga|axis)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");

const STATE_KEYS: Record<string, NgLgaState> = { abuja: "FCT", fct: "FCT" };

/** The city a text names, by its name or a common alias ("PH", "Benin", "Shagamu"). "Lagos" alone is the state. */
export function findCities(text: string | null | undefined): NgCity[] {
  const k = key(text);
  if (!k) return [];
  return NG_CITIES.filter((city) => key(city.name) === k || (city.aliases ?? []).some((alias) => key(alias) === k));
}

export interface PlaceMatch {
  /** "State: Area", ready to save as a coverage token. */
  token: string;
  state: NgLgaState;
  /** The neighbourhood or LGA as we write it. */
  area: string;
  lga: string | null;
  city: string | null;
}

function areaIn(cities: readonly NgCity[], text: string): PlaceMatch | null {
  const k = key(text);
  for (const city of cities) {
    const hit = Object.keys(city.areas).find((name) => key(name) === k);
    if (hit) return { token: `${city.state}: ${hit}`, state: city.state, area: hit, lga: city.areas[hit] ?? null, city: city.name };
  }
  return null;
}

const STATE_OF_CITY = (cities: readonly NgCity[]) => [...new Set(cities.map((city) => city.state))];

/**
 * One place someone said, as a coverage token, using the city or state they named for context: a neighbourhood
 * ("Lafenwa" in Abeokuta → "Ogun: Lafenwa"), else an LGA of the state ("Abeokuta South" → "Ogun: Abeokuta South"),
 * else a neighbourhood anywhere when only one city has it. Null when we can't place it.
 */
export function placeArea(text: string, context: { city?: string | null; state?: string | null } = {}): PlaceMatch | null {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return null;
  const cities = context.city ? findCities(context.city) : [];
  const stateHint = (cities[0]?.state ?? stateOf(context.state)) || null;
  const inCity = areaIn(cities, clean);
  if (inCity) return inCity;
  if (stateHint) {
    const inState = areaIn(NG_CITIES.filter((city) => city.state === stateHint), clean);
    if (inState) return inState;
    const lga = findLga(stateHint, clean);
    if (lga) return { token: `${stateHint}: ${lga}`, state: stateHint, area: lga, lga, city: cities[0]?.name ?? null };
  }
  const anywhere = NG_CITIES.filter((city) => Object.keys(city.areas).some((name) => key(name) === key(clean)));
  if (anywhere.length && STATE_OF_CITY(anywhere).length === 1) return areaIn(anywhere, clean);
  return null;
}

/** "Ogun" / "ogun state" / "Abuja" → the state, else null. */
export function stateOf(text: string | null | undefined): NgLgaState | null {
  const k = key(text);
  if (!k) return null;
  if (STATE_KEYS[k]) return STATE_KEYS[k];
  return (NG_CITIES.find((city) => key(city.state) === k)?.state ?? (ALL_STATES.find((state) => key(state) === k) as NgLgaState | undefined)) ?? null;
}

const ALL_STATES: readonly NgLgaState[] = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

export interface CoverageInput {
  city?: string | null;
  state?: string | null;
  areas?: readonly string[] | null;
}

export interface CoverageResult {
  /** Coverage tokens to save, each once. */
  tokens: string[];
  /** What Peggy (and the toast) says: "Abeokuta – Lafenwa, Kuto". */
  label: string;
  /** What we couldn't place. */
  unknown: string[];
}

/**
 * Coverage from what someone said on a call: a city with the neighbourhoods inside it, a city on its own (all of
 * its LGAs), a state, or a list of places. Places we can't put in a state come back in `unknown`.
 */
export function coverageFrom(input: CoverageInput): CoverageResult {
  const cities = input.city ? findCities(input.city) : [];
  const state = cities[0]?.state ?? stateOf(input.state) ?? stateOf(input.city);
  const areas = (input.areas ?? []).map((area) => String(area ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30);
  const tokens: string[] = [];
  const named: string[] = [];
  const unknown: string[] = [];
  const add = (token: string, name: string) => {
    if (!tokens.includes(token)) {
      tokens.push(token);
      named.push(name);
    }
  };

  if (!areas.length) {
    if (cities.length) {
      for (const city of cities) for (const lga of city.lgas) add(`${city.state}: ${lga}`, lga);
      return { tokens, label: `${cities.map((city) => city.name).join(" and ")} (all areas)`, unknown };
    }
    if (state) return { tokens: [state], label: state, unknown };
    if (input.city) unknown.push(String(input.city).trim());
    return { tokens, label: "", unknown };
  }

  for (const area of areas) {
    // A whole city named in the list ("Ibadan, Abeokuta") counts as all of it.
    const match = placeArea(area, { city: input.city, state });
    const whole = findCities(area);
    if (whole.length && !(match && cities.length)) {
      for (const city of whole) for (const lga of city.lgas) add(`${city.state}: ${lga}`, `${city.name} (all)`);
      continue;
    }
    const asState = stateOf(area);
    if (asState && !match) {
      add(asState, asState);
      continue;
    }
    if (match) add(match.token, match.area);
    else unknown.push(area);
  }
  const where = cities[0]?.name ?? (input.city ? String(input.city).trim() : state ?? "");
  const unique = [...new Set(named)];
  return { tokens, label: where && tokens.length ? `${where} – ${unique.join(", ")}` : unique.join(", "), unknown };
}

/** "Abeokuta: Kuto, Oke-Ilewo, …" lines for the cities in these states (what Peggy reads for the caller's own state). */
export function areasText(states: readonly string[]): string {
  const wanted = new Set(states.map((state) => stateOf(state)).filter(Boolean));
  return NG_CITIES.filter((city) => wanted.has(city.state))
    .map((city) => `${city.name} (${city.state}): ${Object.keys(city.areas).join(", ")}`)
    .join("\n");
}

/** "Abeokuta (Ogun), Ibadan (Oyo), …": every city we know, one line. */
export function citiesText(): string {
  return NG_CITIES.map((city) => `${city.name} (${city.state})`).join(", ");
}

/** The areas of a city, for Peggy's "which areas?" question (empty when we don't know the city). */
export function areasOfCity(text: string | null | undefined): { city: string; state: NgLgaState; areas: string[] }[] {
  return findCities(text).map((city) => ({ city: city.name, state: city.state, areas: Object.keys(city.areas) }));
}
