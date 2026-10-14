// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  "portal.seller": "Olùtajà",
  "portal.supplier": "Supplier",
  "portal.logistics_partner": "Logistics",
  "home.seller": "Lọ sí dashboard mi",
  "home.supplier": "Lọ sí ilé supplier",
  "home.logistics_partner": "Lọ sí ilé logistics",
  "search.seller": "Wá ọjà, order, supplier...",
  "search.supplier": "Wá ọjà, order, àwọn olùrà...",
  "search.logistics_partner": "Wá booking, olùtajà, courier...",

  goHome: "Lọ sí ilé",
  goBack: "Padà sẹ́yìn",
  askPeggy: "Bi Peggy",
  tryAgain: "Tún gbìyànjú",
  reloadNow: "Tún un gbé báyìí",

  "notFound.eyebrowPortal": "404 · {portal} workspace",
  "notFound.eyebrow": "404 · A kò rí ojú-ewé náà",
  "notFound.title": "A kò rí ojú-ewé yẹn",
  "notFound.body": "Ó ṣeé ṣe kí link náà ti gbó tàbí kí wọ́n kọ ọ́ ní àṣìṣe, tàbí kí ojú-ewé náà ti kúrò. Kò sí ohun tó sọnù: ṣọ́ọ̀bù rẹ, àwọn order àti owó rẹ wà gẹ́lẹ́ níbi tí o fi wọ́n sí.",

  "update.eyebrow": "Update · Ẹ̀dà tuntun",
  "update.title": "Shopinbos ṣẹ̀ṣẹ̀ ní update — à ń tún un gbé…",
  "update.body": "A gbé nǹkan tuntun jáde nígbà tí tab yìí ṣí sílẹ̀. À ń mú ẹ̀dà tuntun wá báyìí; iṣẹ́ rẹ wà láìléwu.",

  "error.eyebrowPortal": "Àṣìṣe · {portal} workspace",
  "error.eyebrow": "Àṣìṣe · Nǹkan kan kò ṣiṣẹ́",
  "error.title": "Ojú-ewé yìí kò ṣí",
  "error.body": "Nǹkan kan bàjẹ́ ní ọ̀dọ̀ wa nígbà tí ojú-ewé yìí ń ṣí. Data rẹ wà láìléwu. Tún gbìyànjú láìpẹ́; tí ó bá ń ṣẹlẹ̀ ṣáá, fi reference tó wà nísàlẹ̀ ránṣẹ́ sí wa kí a lè rí i kíákíá.",
  "error.pageTitle": "Nǹkan kan kò ṣiṣẹ́",

  "scene.another": "Sọ òmíì fún mi",
  "scene.ref": "Ref {ref}",
  "scene.copy": "Daakọ",
  "scene.copied": "A ti daakọ",
  "scene.copyRef": "Daakọ reference àṣìṣe fún support",
  "scene.refCopied": "A ti daakọ reference",

  "quip.notFound.1": "Háà, ojú-ewé yìí ti sá lọ.",
  "quip.notFound.2": "Kì í ṣe ìwọ, Rex ni. Ó gbé ojú-ewé yìí kúrò, ó gbàgbé láti sọ fún ẹnikẹ́ni.",
  "quip.notFound.3": "Kódà Peggy wá a káàkiri. Kò sí nǹkan.",
  "quip.notFound.4": "Peggy ti fi gíláàsì rẹ̀ wo abẹ́ gbogbo pẹpẹ. Kò sí àmì ojú-ewé yìí.",
  "quip.notFound.5": "A rán dispatch rider kan. Ó ṣì ń yí roundabout ká, ó ń wá àdírẹ́sì yìí.",
  "quip.notFound.6": "Ojú-ewé yìí lọ ra suya, kò padà wá mọ́.",
  "quip.error.1": "Kì í ṣe ìwọ, Rex ni. Ó ń de bolt kan tó ti tú bí a ṣe ń sọ̀rọ̀.",
  "quip.error.2": "Nǹkan kan bàjẹ́. Rex ti wà lórí rẹ̀ pẹ̀lú spanner rẹ̀.",
  "quip.error.3": "Server wa sinmi díẹ̀. Yóò jí láìpẹ́.",
  "quip.error.4": "Wàhálà kékeré. Kò sí ohun tí a kò lè tún ṣe.",
  "quip.error.5": "Rex de bolt tí kò tọ́. Ó tọrọ àforíjìn gidigidi.",
  "quip.error.6": "Iná ṣẹ́jú ní ọ̀dọ̀ wa. Jẹnẹrétọ̀ ń gbóná.",
  "quip.global.1": "Rex ń tún un ṣe, Peggy ń wò ó. Ìwọ sinmi.",
  "quip.global.2": "Kì í ṣe ìwọ, Rex ni. Peggy ń ràn án lọ́wọ́ láti wá wáyà tó tú.",
  "quip.global.3": "Wàhálà kékeré. Rex ní spanner, Peggy ní gíláàsì.",
  "quip.update.1": "Rex ń de àwọn ẹ̀yà tuntun mọ́ ọn. A ó padà ní ìṣẹ́jú-àáyá.",
};

export default yo;
