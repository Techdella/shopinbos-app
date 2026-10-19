// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  back: "Koma",
  countryCode: "Lambar ƙasa",
  previewSize: "Girman samfoti",
  computerView: "Duba a kwamfuta",
  phoneView: "Duba a waya",
  verificationCode: "Lambar tabbatarwa",
  digit: "Lamba {n}",
  stepOf: "Mataki {n} cikin {total}",
  confirm: "Tabbatar",
  dismiss: "Cire",
  techDetails: "Nuna bayanan fasaha (don {forWho})",
  advanced: "Na gaba (ba dole ba)",
  "scene.paid": "AN BIYA",
  "scene.newIn": "Sabon kaya · Saya yanzu",
  "scene.inStock": "AKWAI SHI",
  "scene.lowStock": "Yana ƙarewa",
  "scene.updated": "An sabunta",
  "scene.secure": "Amintacce ✓",
  "scene.supplier": "SUPPLIER",
  "scene.customer": "ABOKIN CINIKI",
  "scene.shop": "SHAGO",
  "scene.runsItself": "YANA AIKI DA KANSA · 24/7",
  "scene.stillWant": "Har yanzu kana so?",
  "scene.tapToFinish": "Taɓa don gamawa",
  "scene.deal": "An daidaita ✓",
  "scene.cashAtDoor": "KUƊI A BAKIN ƘOFA",
  // Logged in on another portal's page: why they landed on their own home (components/auth/PortalNote.tsx)
  "portalNote.seller": "Kana da account na mai sayarwa, don haka mun buɗe shagonka.",
  "portalNote.supplier": "Kana da account na mai kawo kaya, don haka mun buɗe portal ɗinka.",
  "portalNote.logistics_partner": "Kana da account na abokin isar da kaya, don haka mun buɗe portal ɗinka.",
  "portalNote.admin": "Kana da account na admin, don haka mun buɗe admin panel.",
  "dialog.ok": "To",
  "dialog.continue": "Ci gaba",
  "dialog.done": "An gama",
  "dialog.copy": "Kwafa",
  "dialog.copied": "An kwafa",
};

export default ha;
