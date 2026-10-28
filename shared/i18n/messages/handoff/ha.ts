// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "card.title": "Yi shi a wayarka",
  "card.subSelfie": "Duba wannan lambar da kyamarar wayarka, sannan ka ɗauki selfie a can. Wannan shafin zai ci gaba da kansa idan an gama.",
  "card.subId": "Duba wannan lambar da kyamarar wayarka, sannan ka ɗauki hoton ID ɗinka a can. Wannan shafin zai ci gaba da kansa idan an gama.",
  "card.qrLabel": "Lambar QR da ke buɗe wannan mataki a wayarka",
  "card.orLink": "Ko ka buɗe wannan link a wayarka:",
  "card.copy": "Kwafi link",
  "card.copied": "An kwafa",
  "card.waiting": "Muna jiran wayarka…",
  "card.expired": "Lokacin wannan lambar ya ƙare.",
  "card.newCode": "Nuna sabuwar lamba",
  "card.failed": "Ba mu iya yin link na waya ba. Yi amfani da kyamarar wannan kwamfuta.",
  "card.useComputer": "Yi amfani da kyamarar wannan kwamfuta",
  "card.usePhone": "Yi shi a wayarka maimakon haka",
  "card.cameraFailed": "Kyamarar wannan kwamfuta ba ta fara ba. Duba lambar da wayarka maimakon haka:",
  "page.metaTitle": "Tabbatarwa a wayarka",
  "page.send": "Aika",
  "page.doneTitle": "An gama. Koma kan kwamfutarka.",
  "page.doneBody": "Kwamfutarka za ta ci gaba da kanta cikin 'yan daƙiƙa. Za ka iya rufe wannan shafin.",
  "page.expiredTitle": "Lokacin wannan link ya ƙare",
  "page.expiredBody": "Link yana aiki na minti 20. Duba sabuwar lambar a kwamfutarka.",
  "page.brokenTitle": "Wannan link ba ya aiki",
  "page.brokenBody": "Sake duba lambar a kwamfutarka.",
  "page.needIdFirst": "Ɗauki hoton ID ɗinka tukuna, sannan selfie.",
  "page.failed": "Bai tafi ba. Sake gwadawa.",
};

export default ha;
