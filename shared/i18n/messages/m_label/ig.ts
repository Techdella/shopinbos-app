// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "label.title": "Label mbupu",
  "label.sub": "Bipụta ya, maado ya n'elu parcel, ma ọ bụ ziga ya nye rider gị.",
  "label.loadFailed": "Anyị enwetaghị label ahụ. Lelee network gị, nwaa ọzọ.",
  "label.print": "Bipụta ma ọ bụ kesaa",
  "label.printOff": "Mbipụta adịbeghị njikere. Ziga label ahụ dịka ederede.",
  "label.sendText": "Ziga ya dịka ederede (WhatsApp)",
  "label.paper": "Kedu ihe ị ga-ebipụta ya na ya?",
  "label.sticker": "Label printer",
  "label.a4": "Akwụkwọ A4",
  "label.stickerHint": "Otu sticker 4 × 6 inch, maka label printer.",
  "label.a4Hint": "Printer ọ bụla. Bee ya, maado ya.",
  "label.deliverTo": "Bunye",
  "label.pickup": "Onye ahịa ga-abịa were ya",
  "label.collect": "Nara {amount} mgbe ị na-ebuga ya",
  "label.paid": "Akwụọla ụgwọ. Anaghị ego",
  "label.items": "{count, plural, one {ihe #} other {ihe #}}",
  "label.from": "Site n'aka {shop}",
  "label.fromPhone": "Site · {phone}",
  "label.track": "Soro ya: {url}",
  "label.qr": "QR code iji soro order a",
  "label.expired": "Link mbipụta a agwụla. Laghachi n'app, pịa Print ọzọ.",
};

export default ig;
