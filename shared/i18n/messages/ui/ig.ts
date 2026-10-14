// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  back: "Laghachi",
  countryCode: "Koodu obodo",
  previewSize: "Nha nlele",
  computerView: "Nlele na kọmputa",
  phoneView: "Nlele na ekwentị",
  verificationCode: "Koodu nkwenye",
  digit: "Nọmba {n}",
  stepOf: "Nzọụkwụ {n} n'ime {total}",
  confirm: "Kwado",
  dismiss: "Wepụ",
  techDetails: "Gosi nkọwa teknụzụ (maka {forWho})",
  advanced: "Ndị ọzọ (ọ bụghị iwu)",
  "scene.paid": "AKWỤỌLA",
  "scene.newIn": "Ihe ọhụrụ abịala · Zụta ugbu a",
  "scene.inStock": "Ọ DỊ",
  "scene.lowStock": "Ọ na-agwụ",
  "scene.updated": "Emelitere ya",
  "scene.secure": "Ọ dị nchebe ✓",
  "scene.supplier": "SUPPLIER",
  "scene.customer": "ONYE AHỊA",
  "scene.shop": "ỤLỌ AHỊA",
  "scene.runsItself": "Ọ NA-ARỤ ONWE YA · 24/7",
  "scene.stillWant": "Ị ka chọrọ ya?",
  "scene.tapToFinish": "Pịa ka i mechaa",
  "scene.deal": "Ekwekọrịtara ✓",
  "scene.cashAtDoor": "EGO N'ỌNỤ ỤZỌ",
  // Logged in on another portal's page: why they landed on their own home (components/auth/PortalNote.tsx)
  "portalNote.seller": "Ị nwere account onye na-ere ahịa, ya mere anyị mepere ụlọ ahịa gị.",
  "portalNote.supplier": "Ị nwere account onye na-enye ngwaahịa, ya mere anyị mepere portal gị.",
  "portalNote.logistics_partner": "Ị nwere account onye mmekọ nnyefe, ya mere anyị mepere portal nnyefe gị.",
  "portalNote.admin": "Ị nwere account admin, ya mere anyị mepere admin panel.",
};

export default ig;
