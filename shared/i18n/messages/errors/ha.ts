// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "portal.seller": "Mai sayarwa",
  "portal.supplier": "Supplier",
  "portal.logistics_partner": "Logistics",
  "home.seller": "Je dashboard ɗina",
  "home.supplier": "Je gidan supplier",
  "home.logistics_partner": "Je gidan logistics",
  "search.seller": "Nemi kayayyaki, orders, suppliers...",
  "search.supplier": "Nemi kayayyaki, orders, masu saye...",
  "search.logistics_partner": "Nemi bookings, masu sayarwa, couriers...",

  goHome: "Je gida",
  goBack: "Koma baya",
  askPeggy: "Tambayi Peggy",
  tryAgain: "Sake gwadawa",
  reloadNow: "Sake loda yanzu",

  "notFound.eyebrowPortal": "404 · {portal} workspace",
  "notFound.eyebrow": "404 · Ba a sami shafin ba",
  "notFound.title": "Ba mu sami wannan shafi ba",
  "notFound.body": "Mai yiwuwa link ɗin ya tsufa ko an rubuta shi ba daidai ba, ko kuma an motsa shafin. Babu abin da ya ɓace: shagonka, orders da kuɗinka suna nan daidai inda ka bar su.",

  "update.eyebrow": "Update · Sabon salo",
  "update.title": "Shopinbos ya sami update — ana sake lodawa…",
  "update.body": "Mun fitar da wani sabon abu yayin da wannan tab yake buɗe. Ana kawo sabon salon yanzu; aikinka yana nan lafiya.",

  "error.eyebrowPortal": "Kuskure · {portal} workspace",
  "error.eyebrow": "Kuskure · Wani abu bai yi aiki ba",
  "error.title": "Wannan shafi bai buɗe ba",
  "error.body": "Wani abu a ɓangarenmu ya lalace yayin buɗe wannan shafi. Bayananka suna nan lafiya. Sake gwadawa nan ba da jimawa ba; idan ya ci gaba, aiko mana da reference da ke ƙasa don mu same shi da sauri.",
  "error.pageTitle": "Wani abu bai yi aiki ba",

  "scene.another": "Faɗa min wani",
  "scene.ref": "Ref {ref}",
  "scene.copy": "Kwafa",
  "scene.copied": "An kwafa",
  "scene.copyRef": "Kwafi reference na kuskure don support",
  "scene.refCopied": "An kwafi reference",

  "quip.notFound.1": "Kai, wannan shafi ya gudu.",
  "quip.notFound.2": "Ba kai ba ne, Rex ne. Ya motsa wannan shafi ya manta bai gaya wa kowa ba.",
  "quip.notFound.3": "Ko Peggy ta nema ko'ina. Babu komai.",
  "quip.notFound.4": "Peggy ta duba ƙarƙashin kowane shiryayye da gilashinta. Babu alamar wannan shafi.",
  "quip.notFound.5": "Mun tura dispatch rider. Har yanzu yana zagaya roundabout yana neman wannan adireshi.",
  "quip.notFound.6": "Wannan shafi ya je sayen suya bai dawo ba.",
  "quip.error.1": "Ba kai ba ne, Rex ne. Yana ɗaure wani bolt da ya sako yanzu haka.",
  "quip.error.2": "Wani abu ya karye. Rex ya riga ya kama shi da spanner ɗinsa.",
  "quip.error.3": "Server ɗinmu ya ɗan huta. Zai farka nan ba da jimawa ba.",
  "quip.error.4": "Ƙaramar matsala. Babu abin da ba za mu iya gyarawa ba.",
  "quip.error.5": "Rex ya ɗaure bolt ɗin da ba daidai ba. Yana neman afuwa sosai.",
  "quip.error.6": "Wuta ta ɗan kashe a wajenmu. Janareto yana ɗumama.",
  "quip.global.1": "Rex yana gyarawa, Peggy tana dubawa. Kai dai ka huta.",
  "quip.global.2": "Ba kai ba ne, Rex ne. Peggy tana taimaka masa neman wayar da ta sako.",
  "quip.global.3": "Ƙaramar matsala. Rex yana da spanner, Peggy tana da gilashi.",
  "quip.update.1": "Rex yana ɗaura sababbin sassa. Za mu dawo cikin ƙiftawar ido.",
};

export default ha;
