// Nigeria's 774 local government areas (INEC / NBS list), keyed by the state names in shared/delivery-market.ts
// NG_STATES ("FCT" holds the six area councils), plus the city/area names people type that sit inside one LGA.
// Used for LGA pickers (datalists) and for matching "State: LGA" coverage tokens against customer addresses.
// Pure (no imports), unit-tested in tests/ng-lgas.test.mjs.

export type NgLgaState =
  | "Abia" | "Adamawa" | "Akwa Ibom" | "Anambra" | "Bauchi" | "Bayelsa" | "Benue" | "Borno" | "Cross River" | "Delta"
  | "Ebonyi" | "Edo" | "Ekiti" | "Enugu" | "FCT" | "Gombe" | "Imo" | "Jigawa" | "Kaduna" | "Kano" | "Katsina" | "Kebbi"
  | "Kogi" | "Kwara" | "Lagos" | "Nasarawa" | "Niger" | "Ogun" | "Ondo" | "Osun" | "Oyo" | "Plateau" | "Rivers"
  | "Sokoto" | "Taraba" | "Yobe" | "Zamfara";

export const NG_LGAS: Record<NgLgaState, readonly string[]> = {
  Abia: [
    "Aba North", "Aba South", "Arochukwu", "Bende", "Ikwuano", "Isiala Ngwa North", "Isiala Ngwa South", "Isuikwuato",
    "Obi Ngwa", "Ohafia", "Osisioma", "Ugwunagbo", "Ukwa East", "Ukwa West", "Umuahia North", "Umuahia South", "Umu Nneochi",
  ],
  Adamawa: [
    "Demsa", "Fufure", "Ganye", "Gayuk", "Gombi", "Grie", "Hong", "Jada", "Lamurde", "Madagali", "Maiha", "Mayo Belwa",
    "Michika", "Mubi North", "Mubi South", "Numan", "Shelleng", "Song", "Toungo", "Yola North", "Yola South",
  ],
  "Akwa Ibom": [
    "Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan", "Ibeno", "Ibesikpo Asutan",
    "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom",
    "Nsit-Ubium", "Obot Akara", "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafun", "Uruan", "Urue-Offong/Oruko",
    "Uyo",
  ],
  Anambra: [
    "Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North", "Awka South", "Ayamelum", "Dunukofia", "Ekwusigo",
    "Idemili North", "Idemili South", "Ihiala", "Njikoka", "Nnewi North", "Nnewi South", "Ogbaru", "Onitsha North",
    "Onitsha South", "Orumba North", "Orumba South", "Oyi",
  ],
  Bauchi: [
    "Alkaleri", "Bauchi", "Bogoro", "Damban", "Darazo", "Dass", "Gamawa", "Ganjuwa", "Giade", "Itas/Gadau", "Jama'are",
    "Katagum", "Kirfi", "Misau", "Ningi", "Shira", "Tafawa Balewa", "Toro", "Warji", "Zaki",
  ],
  Bayelsa: ["Brass", "Ekeremor", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Sagbama", "Southern Ijaw", "Yenagoa"],
  Benue: [
    "Ado", "Agatu", "Apa", "Buruku", "Gboko", "Guma", "Gwer East", "Gwer West", "Katsina-Ala", "Konshisha", "Kwande", "Logo",
    "Makurdi", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu", "Oturkpo", "Tarka", "Ukum", "Ushongo", "Vandeikya",
  ],
  Borno: [
    "Abadam", "Askira/Uba", "Bama", "Bayo", "Biu", "Chibok", "Damboa", "Dikwa", "Gubio", "Guzamala", "Gwoza", "Hawul",
    "Jere", "Kaga", "Kala/Balge", "Konduga", "Kukawa", "Kwaya Kusar", "Mafa", "Magumeri", "Maiduguri", "Marte", "Mobbar",
    "Monguno", "Ngala", "Nganzai", "Shani",
  ],
  "Cross River": [
    "Abi", "Akamkpa", "Akpabuyo", "Bakassi", "Bekwarra", "Biase", "Boki", "Calabar Municipal", "Calabar South", "Etung",
    "Ikom", "Obanliku", "Obubra", "Obudu", "Odukpani", "Ogoja", "Yakuur", "Yala",
  ],
  Delta: [
    "Aniocha North", "Aniocha South", "Bomadi", "Burutu", "Ethiope East", "Ethiope West", "Ika North East", "Ika South",
    "Isoko North", "Isoko South", "Ndokwa East", "Ndokwa West", "Okpe", "Oshimili North", "Oshimili South", "Patani",
    "Sapele", "Udu", "Ughelli North", "Ughelli South", "Ukwuani", "Uvwie", "Warri North", "Warri South", "Warri South West",
  ],
  Ebonyi: [
    "Abakaliki", "Afikpo North", "Afikpo South", "Ebonyi", "Ezza North", "Ezza South", "Ikwo", "Ishielu", "Ivo", "Izzi",
    "Ohaozara", "Ohaukwu", "Onicha",
  ],
  Edo: [
    "Akoko-Edo", "Egor", "Esan Central", "Esan North-East", "Esan South-East", "Esan West", "Etsako Central", "Etsako East",
    "Etsako West", "Igueben", "Ikpoba Okha", "Oredo", "Orhionmwon", "Ovia North-East", "Ovia South-West", "Owan East",
    "Owan West", "Uhunmwonde",
  ],
  Ekiti: [
    "Ado Ekiti", "Efon", "Ekiti East", "Ekiti South-West", "Ekiti West", "Emure", "Gbonyin", "Ido Osi", "Ijero", "Ikere",
    "Ikole", "Ilejemeje", "Irepodun/Ifelodun", "Ise/Orun", "Moba", "Oye",
  ],
  Enugu: [
    "Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Ezeagu", "Igbo Etiti", "Igbo Eze North", "Igbo Eze South",
    "Isi Uzo", "Nkanu East", "Nkanu West", "Nsukka", "Oji River", "Udenu", "Udi", "Uzo Uwani",
  ],
  FCT: ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal Area Council"],
  Gombe: ["Akko", "Balanga", "Billiri", "Dukku", "Funakaye", "Gombe", "Kaltungo", "Kwami", "Nafada", "Shongom", "Yamaltu/Deba"],
  Imo: [
    "Aboh Mbaise", "Ahiazu Mbaise", "Ehime Mbano", "Ezinihitte", "Ideato North", "Ideato South", "Ihitte/Uboma", "Ikeduru",
    "Isiala Mbano", "Isu", "Mbaitoli", "Ngor Okpala", "Njaba", "Nkwerre", "Nwangele", "Obowo", "Oguta", "Ohaji/Egbema",
    "Okigwe", "Orlu", "Orsu", "Oru East", "Oru West", "Owerri Municipal", "Owerri North", "Owerri West", "Unuimo",
  ],
  Jigawa: [
    "Auyo", "Babura", "Biriniwa", "Birnin Kudu", "Buji", "Dutse", "Gagarawa", "Garki", "Gumel", "Guri", "Gwaram", "Gwiwa",
    "Hadejia", "Jahun", "Kafin Hausa", "Kaugama", "Kazaure", "Kiri Kasama", "Kiyawa", "Maigatari", "Malam Madori", "Miga",
    "Ringim", "Roni", "Sule Tankarkar", "Taura", "Yankwashi",
  ],
  Kaduna: [
    "Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba", "Jema'a", "Kachia", "Kaduna North", "Kaduna South",
    "Kagarko", "Kajuru", "Kaura", "Kauru", "Kubau", "Kudan", "Lere", "Makarfi", "Sabon Gari", "Sanga", "Soba",
    "Zangon Kataf", "Zaria",
  ],
  Kano: [
    "Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi", "Bunkure", "Dala", "Dambatta", "Dawakin Kudu", "Dawakin Tofa",
    "Doguwa", "Fagge", "Gabasawa", "Garko", "Garun Mallam", "Gaya", "Gezawa", "Gwale", "Gwarzo", "Kabo", "Kano Municipal",
    "Karaye", "Kibiya", "Kiru", "Kumbotso", "Kunchi", "Kura", "Madobi", "Makoda", "Minjibir", "Nasarawa", "Rano",
    "Rimin Gado", "Rogo", "Shanono", "Sumaila", "Takai", "Tarauni", "Tofa", "Tsanyawa", "Tudun Wada", "Ungogo", "Warawa",
    "Wudil",
  ],
  Katsina: [
    "Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi", "Dandume", "Danja", "Dan Musa", "Daura", "Dutsi",
    "Dutsin Ma", "Faskari", "Funtua", "Ingawa", "Jibia", "Kafur", "Kaita", "Kankara", "Kankia", "Katsina", "Kurfi",
    "Kusada", "Mai'Adua", "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa", "Rimi", "Sabuwa", "Safana", "Sandamu", "Zango",
  ],
  Kebbi: [
    "Aleiro", "Arewa Dandi", "Argungu", "Augie", "Bagudo", "Birnin Kebbi", "Bunza", "Dandi", "Fakai", "Gwandu", "Jega",
    "Kalgo", "Koko/Besse", "Maiyama", "Ngaski", "Sakaba", "Shanga", "Suru", "Wasagu/Danko", "Yauri", "Zuru",
  ],
  Kogi: [
    "Adavi", "Ajaokuta", "Ankpa", "Bassa", "Dekina", "Ibaji", "Idah", "Igalamela-Odolu", "Ijumu", "Kabba/Bunu", "Kogi",
    "Lokoja", "Mopa-Muro", "Ofu", "Ogori/Magongo", "Okehi", "Okene", "Olamaboro", "Omala", "Yagba East", "Yagba West",
  ],
  Kwara: [
    "Asa", "Baruten", "Edu", "Ekiti", "Ifelodun", "Ilorin East", "Ilorin South", "Ilorin West", "Irepodun", "Isin", "Kaiama",
    "Moro", "Offa", "Oke Ero", "Oyun", "Pategi",
  ],
  Lagos: [
    "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki",
    "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo",
    "Shomolu", "Surulere",
  ],
  Nasarawa: ["Akwanga", "Awe", "Doma", "Karu", "Keana", "Keffi", "Kokona", "Lafia", "Nasarawa", "Nasarawa Egon", "Obi", "Toto", "Wamba"],
  Niger: [
    "Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati", "Gbako", "Gurara", "Katcha", "Kontagora", "Lapai",
    "Lavun", "Magama", "Mariga", "Mashegu", "Mokwa", "Munya", "Paikoro", "Rafi", "Rijau", "Shiroro", "Suleja", "Tafa",
    "Wushishi",
  ],
  Ogun: [
    "Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Egbado North", "Egbado South", "Ewekoro", "Ifo", "Ijebu East",
    "Ijebu North", "Ijebu North East", "Ijebu Ode", "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode", "Odeda", "Odogbolu",
    "Ogun Waterside", "Remo North", "Sagamu",
  ],
  Ondo: [
    "Akoko North-East", "Akoko North-West", "Akoko South-East", "Akoko South-West", "Akure North", "Akure South", "Ese Odo",
    "Idanre", "Ifedore", "Ilaje", "Ile Oluji/Okeigbo", "Irele", "Odigbo", "Okitipupa", "Ondo East", "Ondo West", "Ose", "Owo",
  ],
  Osun: [
    "Aiyedaade", "Aiyedire", "Atakunmosa East", "Atakunmosa West", "Boluwaduro", "Boripe", "Ede North", "Ede South",
    "Egbedore", "Ejigbo", "Ife Central", "Ife East", "Ife North", "Ife South", "Ifedayo", "Ifelodun", "Ila", "Ilesa East",
    "Ilesa West", "Irepodun", "Irewole", "Isokan", "Iwo", "Obokun", "Odo Otin", "Ola Oluwa", "Olorunda", "Oriade", "Orolu",
    "Osogbo",
  ],
  Oyo: [
    "Afijio", "Akinyele", "Atiba", "Atisbo", "Egbeda", "Ibadan North", "Ibadan North-East", "Ibadan North-West",
    "Ibadan South-East", "Ibadan South-West", "Ibarapa Central", "Ibarapa East", "Ibarapa North", "Ido", "Irepo", "Iseyin",
    "Itesiwaju", "Iwajowa", "Kajola", "Lagelu", "Ogbomosho North", "Ogbomosho South", "Ogo Oluwa", "Olorunsogo", "Oluyole",
    "Ona Ara", "Orelope", "Ori Ire", "Oyo East", "Oyo West", "Saki East", "Saki West", "Surulere",
  ],
  Plateau: [
    "Barkin Ladi", "Bassa", "Bokkos", "Jos East", "Jos North", "Jos South", "Kanam", "Kanke", "Langtang North",
    "Langtang South", "Mangu", "Mikang", "Pankshin", "Qua'an Pan", "Riyom", "Shendam", "Wase",
  ],
  Rivers: [
    "Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua",
    "Etche", "Gokana", "Ikwerre", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro",
    "Oyigbo", "Port Harcourt", "Tai",
  ],
  Sokoto: [
    "Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu", "Gwadabawa", "Illela", "Isa", "Kebbe", "Kware", "Rabah",
    "Sabon Birni", "Shagari", "Silame", "Sokoto North", "Sokoto South", "Tambuwal", "Tangaza", "Tureta", "Wamako", "Wurno",
    "Yabo",
  ],
  Taraba: [
    "Ardo Kola", "Bali", "Donga", "Gashaka", "Gassol", "Ibi", "Jalingo", "Karim Lamido", "Kurmi", "Lau", "Sardauna",
    "Takum", "Ussa", "Wukari", "Yorro", "Zing",
  ],
  Yobe: [
    "Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Gulani", "Jakusko", "Karasuwa", "Machina", "Nangere",
    "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari",
  ],
  Zamfara: [
    "Anka", "Bakura", "Birnin Magaji/Kiyaw", "Bukkuyum", "Bungudu", "Gummi", "Gusau", "Kaura Namoda", "Maradun", "Maru",
    "Shinkafi", "Talata Mafara", "Tsafe", "Zurmi",
  ],
};

/** Other ways an LGA's own name is written (old names, short forms, the other half of a joined name). */
const LGA_ALIASES: Partial<Record<NgLgaState, Record<string, string>>> = {
  Lagos: {
    "eti osa": "Eti-Osa", oshodi: "Oshodi-Isolo", isolo: "Oshodi-Isolo", somolu: "Shomolu", ajeromi: "Ajeromi-Ifelodun",
    ifelodun: "Ajeromi-Ifelodun", ifako: "Ifako-Ijaiye", ijaiye: "Ifako-Ijaiye", amuwo: "Amuwo-Odofin", "ibeju": "Ibeju-Lekki",
    mainland: "Lagos Mainland", "lagos island": "Lagos Island",
  },
  FCT: {
    amac: "Municipal Area Council", "abuja municipal": "Municipal Area Council", "abuja municipal area council": "Municipal Area Council",
    municipal: "Municipal Area Council",
  },
  Rivers: { "obio akpor": "Obio/Akpor", obio: "Obio/Akpor", phalga: "Port Harcourt", ph: "Port Harcourt", onelga: "Ogba/Egbema/Ndoni" },
  Ogun: { "yewa north": "Egbado North", "yewa south": "Egbado South", ota: "Ado-Odo/Ota", shagamu: "Sagamu" },
  Ekiti: { ado: "Ado Ekiti" },
  Kano: { "kano city": "Kano Municipal" },
  Imo: { owerri: "Owerri Municipal" },
  Edo: { ikpoba: "Ikpoba Okha" },
  Niger: { minna: "Chanchaga" },
  Kwara: { patigi: "Pategi" },
  Oyo: { ogbomoso: "Ogbomosho North" },
};

/** Popular city/area names people type, each wholly inside one LGA (kept to ones we're sure of). */
export const COMMON_AREAS: Partial<Record<NgLgaState, Record<string, string>>> = {
  Lagos: {
    Lekki: "Eti-Osa", "Victoria Island": "Eti-Osa", VI: "Eti-Osa", Ikoyi: "Eti-Osa", Ajah: "Eti-Osa", Oniru: "Eti-Osa",
    Sangotedo: "Eti-Osa", Ikota: "Eti-Osa", Chevron: "Eti-Osa", Badore: "Eti-Osa", Osapa: "Eti-Osa", Agungi: "Eti-Osa",
    Yaba: "Lagos Mainland", "Ebute Metta": "Lagos Mainland", Gbagada: "Kosofe", Ketu: "Kosofe", Ojota: "Kosofe",
    Ogudu: "Kosofe", Festac: "Amuwo-Odofin", "Mile 2": "Amuwo-Odofin", Ikotun: "Alimosho", Egbeda: "Alimosho",
    Idimu: "Alimosho", Igando: "Alimosho", Ipaja: "Alimosho", "Iyana Ipaja": "Alimosho", Opebi: "Ikeja", Alausa: "Ikeja",
    Oregun: "Ikeja", Ogba: "Ikeja", Ojodu: "Ikeja", "Allen Avenue": "Ikeja", Okota: "Oshodi-Isolo", Ejigbo: "Oshodi-Isolo",
    Bariga: "Shomolu", Idumota: "Lagos Island", Marina: "Lagos Island", "Isale Eko": "Lagos Island", Ajegunle: "Ajeromi-Ifelodun",
  },
  FCT: {
    Wuse: "Municipal Area Council", Garki: "Municipal Area Council", Maitama: "Municipal Area Council",
    Asokoro: "Municipal Area Council", Jabi: "Municipal Area Council", Utako: "Municipal Area Council",
    Gwarinpa: "Municipal Area Council", Wuye: "Municipal Area Council", "Central Business District": "Municipal Area Council",
    CBD: "Municipal Area Council", Lugbe: "Municipal Area Council", "Life Camp": "Municipal Area Council",
    Katampe: "Municipal Area Council", Durumi: "Municipal Area Council", Apo: "Municipal Area Council",
    Lokogoma: "Municipal Area Council", Nyanya: "Municipal Area Council", Karu: "Municipal Area Council",
    Kubwa: "Bwari", Dutse: "Bwari",
  },
  Rivers: {
    "Port Harcourt": "Port Harcourt", PH: "Port Harcourt", GRA: "Port Harcourt", "Old GRA": "Port Harcourt",
    "D-Line": "Port Harcourt", Diobu: "Port Harcourt", Rumuokoro: "Obio/Akpor", Rumuola: "Obio/Akpor", Choba: "Obio/Akpor",
  },
  Ogun: { Ota: "Ado-Odo/Ota", "Sango Ota": "Ado-Odo/Ota", Mowe: "Obafemi Owode", Ibafo: "Obafemi Owode" },
  Delta: { Asaba: "Oshimili South", Effurun: "Uvwie" },
  Kano: { "Sabon Gari": "Fagge" },
  Oyo: { Bodija: "Ibadan North" },
};

/** Lower case, accents and punctuation gone, one space between words ("Eti-Osa" → "eti osa"). */
const spaced = (text: string) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** The same with no spaces, so "Eti Osa", "Eti-Osa" and "EtiOsa" all match. */
const squashed = (text: string) => spaced(text).replace(/ /g, "");

const stateKey = (state: string | null | undefined): NgLgaState | null => {
  const plain = squashed(String(state ?? "").replace(/\bstate\b/gi, ""));
  if (["fct", "abuja", "federalcapitalterritory"].includes(plain)) return "FCT";
  return (Object.keys(NG_LGAS) as NgLgaState[]).find((key) => squashed(key) === plain) ?? null;
};

/** The state's LGAs (empty for a state we don't know). */
export function lgasOf(state: string | null | undefined): readonly string[] {
  const key = stateKey(state);
  return key ? NG_LGAS[key] : [];
}

/** Each name that means an LGA (its own name, the parts of a joined "A/B" name, aliases) → that LGA, by squashed key. */
const nameIndex = new Map<NgLgaState, Map<string, string>>();
function namesOf(state: NgLgaState): Map<string, string> {
  let index = nameIndex.get(state);
  if (index) return index;
  index = new Map();
  for (const lga of NG_LGAS[state]) index.set(squashed(lga), lga);
  for (const [alias, lga] of Object.entries(LGA_ALIASES[state] ?? {})) if (!index.has(squashed(alias))) index.set(squashed(alias), lga);
  nameIndex.set(state, index);
  return index;
}

/**
 * The LGA a text names in a state, ignoring case, hyphens, slashes and spaces, and knowing common short forms
 * ("eti osa" → "Eti-Osa", "Isolo" → "Oshodi-Isolo", "Somolu" → "Shomolu", "AMAC" → "Municipal Area Council").
 * Null when it isn't an LGA name.
 */
export function findLga(state: string | null | undefined, text: string | null | undefined): string | null {
  const key = stateKey(state);
  if (!key) return null;
  const names = namesOf(key);
  const full = squashed(String(text ?? ""));
  const bare = squashed(String(text ?? "").replace(/\b(lga|l g a|local government( area)?|area council)\b/gi, " "));
  return (full && names.get(full)) || (bare && names.get(bare)) || null;
}

/** Every name (LGA, alias, common area) in a state as [spaced words, LGA], longest first, for finding one inside an address. */
const phraseIndex = new Map<NgLgaState, [string, string][]>();
function phrasesOf(state: NgLgaState): [string, string][] {
  let list = phraseIndex.get(state);
  if (list) return list;
  const all: [string, string][] = [];
  for (const lga of NG_LGAS[state]) {
    all.push([spaced(lga), lga]);
    if (lga.includes("/")) for (const part of lga.split("/")) all.push([spaced(part), lga]);
  }
  for (const [alias, lga] of Object.entries(LGA_ALIASES[state] ?? {})) all.push([spaced(alias), lga]);
  for (const [area, lga] of Object.entries(COMMON_AREAS[state] ?? {})) all.push([spaced(area), lga]);
  list = all.filter(([phrase]) => phrase.length >= 2).sort((a, b) => b[0].length - a[0].length);
  phraseIndex.set(state, list);
  return list;
}

/**
 * The LGA an area or address line is in, as far as we can tell: an LGA name, else a common area name ("Lekki" →
 * "Eti-Osa"), else the longest LGA/area name found as whole words inside it ("Lekki Phase 1" → "Eti-Osa",
 * "Plot 4, Wuse 2" → "Municipal Area Council"). Null when nothing matches.
 */
export function lgaOfArea(state: string | null | undefined, text: string | null | undefined): string | null {
  const key = stateKey(state);
  if (!key) return null;
  const exact = findLga(key, text);
  if (exact) return exact;
  const plain = spaced(String(text ?? ""));
  if (!plain) return null;
  const common = Object.entries(COMMON_AREAS[key] ?? {}).find(([area]) => squashed(area) === squashed(plain));
  if (common) return common[1];
  const padded = ` ${plain} `;
  return phrasesOf(key).find(([phrase]) => padded.includes(` ${phrase} `))?.[1] ?? null;
}

/** Datalist suggestions for an area field: the state's LGAs, then its common area names (deduplicated, sorted). */
export function areaSuggestions(state: string | null | undefined): string[] {
  const key = stateKey(state);
  if (!key) return [];
  const names = [...NG_LGAS[key], ...Object.keys(COMMON_AREAS[key] ?? {})];
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
