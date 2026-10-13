// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "portal.seller": "Onye na-ere ahịa",
  "portal.supplier": "Supplier",
  "portal.logistics_partner": "Logistics",
  "home.seller": "Gaa na dashboard m",
  "home.supplier": "Gaa n'ụlọ supplier",
  "home.logistics_partner": "Gaa n'ụlọ logistics",
  "search.seller": "Chọọ ngwaahịa, orders, suppliers...",
  "search.supplier": "Chọọ ngwaahịa, orders, ndị na-azụ...",
  "search.logistics_partner": "Chọọ bookings, ndị na-ere ahịa, couriers...",

  goHome: "Laa n'ụlọ",
  goBack: "Laghachi azụ",
  askPeggy: "Jụọ Peggy",
  tryAgain: "Nwaa ọzọ",
  reloadNow: "Buo ya ọzọ ugbu a",

  "notFound.eyebrowPortal": "404 · {portal} workspace",
  "notFound.eyebrow": "404 · Ahụghị peeji ahụ",
  "notFound.title": "Anyị ahụghị peeji ahụ",
  "notFound.body": "Ikekwe link ahụ emeela agadi ma ọ bụ e dehiere ya, ma ọ bụ peeji ahụ akwagala. Ọ dịghị ihe furu efu: ụlọ ahịa gị, orders na ego gị dị kpọmkwem ebe ị hapụrụ ha.",

  "update.eyebrow": "Update · Ụdị ọhụrụ",
  "update.title": "Shopinbos nwetara update — ọ na-ebugharị…",
  "update.body": "Anyị wepụtara ihe ọhụrụ mgbe tab a mepere emepe. Anyị na-ewete ụdị ọhụrụ ugbu a; ọrụ gị dị mma.",

  "error.eyebrowPortal": "Njehie · {portal} workspace",
  "error.eyebrow": "Njehie · Ihe adịghị mma",
  "error.title": "Peeji a ebughị",
  "error.body": "Ihe mebiri n'akụkụ anyị mgbe peeji a na-ebu. Data gị dị mma. Nwaa ọzọ n'oge na-adịghị anya; ọ bụrụ na ọ na-eme mgbe niile, zitere anyị reference dị n'okpuru ka anyị chọta ya ngwa ngwa.",
  "error.pageTitle": "Ihe adịghị mma",

  "scene.another": "Gwa m nke ọzọ",
  "scene.ref": "Ref {ref}",
  "scene.copy": "Detuo",
  "scene.copied": "Edetuola",
  "scene.copyRef": "Detuo reference njehie maka support",
  "scene.refCopied": "Edetuola reference",

  "quip.notFound.1": "Chai, peeji a agbapụla.",
  "quip.notFound.2": "Ọ bụghị gị, ọ bụ Rex. Ọ kwagara peeji a ma chefuo ịgwa onye ọ bụla.",
  "quip.notFound.3": "Ọbụna Peggy chọgharịrị ebe niile. Ọ dịghị ihe.",
  "quip.notFound.4": "Peggy ejirila ugegbe ya lelee n'okpuru shelf ọ bụla. Enweghị akara peeji a.",
  "quip.notFound.5": "Anyị zipụrụ dispatch rider. Ọ ka na-agagharị roundabout na-achọ adreesị a.",
  "quip.notFound.6": "Peeji a gara ịzụ suya, ọ lọghachiteghị.",
  "quip.error.1": "Ọ bụghị gị, ọ bụ Rex. Ọ na-ekechi bolt tọgbọrọ ka anyị na-ekwu okwu.",
  "quip.error.2": "Ihe mebiri. Rex ejirila spanner ya malite ịrụ ya.",
  "quip.error.3": "Server anyị zuru ike ntakịrị. Ọ ga-eteta n'oge na-adịghị anya.",
  "quip.error.4": "Obere nsogbu. Ọ dịghị ihe anyị na-enweghị ike idozi.",
  "quip.error.5": "Rex kechiri bolt na-ezighị ezi. O wutere ya nke ukwuu.",
  "quip.error.6": "Ọkụ gbanyụrụ ntakịrị n'akụkụ anyị. Jenereto na-ekpo ọkụ.",
  "quip.global.1": "Rex na-edozi, Peggy na-elele. Naanị zuo ike.",
  "quip.global.2": "Ọ bụghị gị, ọ bụ Rex. Peggy na-enyere ya aka ịchọta waya tọgbọrọ.",
  "quip.global.3": "Obere nsogbu. Rex nwere spanner, Peggy nwere ugegbe.",
  "quip.update.1": "Rex na-etinye akụkụ ọhụrụ. Anyị ga-alọta n'otu ntabi anya.",
};

export default ig;
