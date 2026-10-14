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
};

export default ha;
