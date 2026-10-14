// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  back: "Padà",
  countryCode: "Kóòdù orílẹ̀-èdè",
  previewSize: "Ìwọ̀n àwòkọ́ṣe",
  computerView: "Wíwò lórí kọ̀ǹpútà",
  phoneView: "Wíwò lórí fóònù",
  verificationCode: "Kóòdù ìfìdímúlẹ̀",
  digit: "Nọ́ńbà {n}",
  stepOf: "Ìgbésẹ̀ {n} nínú {total}",
  confirm: "Fìdí rẹ̀ múlẹ̀",
  dismiss: "Yọ ọ́ kúrò",
  techDetails: "Fi àlàyé ìmọ̀-ẹ̀rọ hàn (fún {forWho})",
  advanced: "Ìtẹ̀síwájú (kò pọn dandan)",
  "scene.paid": "A TI SAN",
  "scene.newIn": "Tuntun dé · Rà báyìí",
  "scene.inStock": "Ó WÀ",
  "scene.lowStock": "Ó ń tán",
  "scene.updated": "A ti ṣàtúnṣe",
  "scene.secure": "Ó ní ààbò ✓",
  "scene.supplier": "SUPPLIER",
  "scene.customer": "ONÍBÀÁRÀ",
  "scene.shop": "ṢỌ́Ọ̀BÙ",
  "scene.runsItself": "Ó Ń ṢE ARA RẸ̀ · 24/7",
  "scene.stillWant": "Ṣé o ṣì fẹ́ ẹ?",
  "scene.tapToFinish": "Tẹ̀ ẹ́ láti parí",
  "scene.deal": "A ti fẹnukò ✓",
  "scene.cashAtDoor": "OWÓ NÍ ẸNU ÌLẸ̀KÙN",
  // Logged in on another portal's page: why they landed on their own home (components/auth/PortalNote.tsx)
  "portalNote.seller": "O ní account olùtajà, nítorí náà a ṣí ṣọ́ọ̀bù rẹ.",
  "portalNote.supplier": "O ní account olùpèsè ọjà, nítorí náà a ṣí portal olùpèsè rẹ.",
  "portalNote.logistics_partner": "O ní account alábàáṣiṣẹ́ ìfijíṣẹ́, nítorí náà a ṣí portal ìfijíṣẹ́ rẹ.",
  "portalNote.admin": "O ní account admin, nítorí náà a ṣí admin panel.",
};

export default yo;
