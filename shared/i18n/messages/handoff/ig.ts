// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "card.title": "Mee ya na ekwentị gị",
  "card.subSelfie": "Jiri igwefoto ekwentị gị nyochaa koodu a, ma see selfie ebe ahụ. Ibe a ga-aga n'ihu n'onwe ya mgbe ọ gwụchara.",
  "card.subId": "Jiri igwefoto ekwentị gị nyochaa koodu a, ma see foto ID gị ebe ahụ. Ibe a ga-aga n'ihu n'onwe ya mgbe ọ gwụchara.",
  "card.qrLabel": "Koodu QR na-emeghe nzọụkwụ a na ekwentị gị",
  "card.orLink": "Ma ọ bụ mepee njikọ a na ekwentị gị:",
  "card.copy": "Detuo njikọ",
  "card.copied": "Edetuola",
  "card.waiting": "Anyị na-echere ekwentị gị…",
  "card.expired": "Oge koodu a agwụla.",
  "card.newCode": "Gosi koodu ọhụrụ",
  "card.failed": "Anyị enweghị ike ịme njikọ ekwentị. Jiri igwefoto kọmputa a kama.",
  "card.useComputer": "Jiri igwefoto kọmputa a kama",
  "card.usePhone": "Mee ya na ekwentị gị kama",
  "card.cameraFailed": "Igwefoto kọmputa a amaliteghị. Jiri ekwentị gị nyochaa koodu a kama:",
  "page.metaTitle": "Nyochaa na ekwentị gị",
  "page.send": "Zipu",
  "page.doneTitle": "Emechaala. Laghachi na kọmputa gị.",
  "page.doneBody": "Kọmputa gị ga-aga n'ihu n'onwe ya n'ime sekọnd ole na ole. Ị nwere ike imechi ibe a.",
  "page.expiredTitle": "Oge njikọ a agwụla",
  "page.expiredBody": "Njikọ na-arụ ọrụ maka nkeji 20. Nyochaa koodu ọhụrụ na kọmputa gị.",
  "page.brokenTitle": "Njikọ a anaghị arụ ọrụ",
  "page.brokenBody": "Nyochaa koodu ahụ na kọmputa gị ọzọ.",
  "page.needIdFirst": "Buru ụzọ see foto ID gị, mgbe ahụ selfie.",
  "page.failed": "Ọ gaghị. Nwaa ọzọ.",
};

export default ig;
