// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "label.title": "Label mbupu",
  "label.sub": "Bipụta ya, maado ya n'elu ngwugwu, ma ọ bụ ziga ya nye rider gị.",
  "label.loadFailed": "Anyị enwetaghị label ahụ. Lelee network gị, wee nwaa ọzọ.",
  "label.print": "Bipụta ma ọ bụ kesaa",
  "label.printOff": "Mbipụta adịbeghị njikere. Ziga label ahụ dị ka ederede.",
  "label.sendText": "Ziga ya dị ka ederede (WhatsApp)",
  "label.paper": "Kedu ihe ị ga-ebipụta ya na ya?",
  "label.sticker": "Label printer",
  "label.a4": "Akwụkwọ A4",
  "label.stickerHint": "Otu sticker 4 × 6 inch, maka label printer.",
  "label.a4Hint": "Printer ọ bụla. Bee ya, maado ya.",
  "label.deliverTo": "Buga ya nye",
  "label.pickup": "Onye ahịa ga-abịa were ya",
  "label.collect": "Nara {amount} n'aka onye ahịa mgbe delivery",
  "label.paid": "A kwụọla ụgwọ. Anala ego",
  "label.items": "{count, plural, other {ihe #}}",
  "label.from": "Site n'aka {shop}",
  "label.fromPhone": "Site · {phone}",
  "label.track": "Soro ya: {url}",
  "label.qr": "QR code iji soro order a",
  "label.expired": "Oge link mbipụta a agafeela. Laghachi n'app, pịa Bipụta ọzọ.",
};

export default ig;
