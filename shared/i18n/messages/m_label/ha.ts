// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "label.title": "Label na aikawa",
  "label.sub": "Buga shi ka manna a kan ƙunshin kayan, ko ka aika wa rider ɗinka.",
  "label.loadFailed": "Ba mu samo label ɗin ba. Duba network ɗinka, ka sake gwadawa.",
  "label.print": "Buga ko raba",
  "label.printOff": "Bugawa ba ta shirya ba tukuna. Aika label ɗin a matsayin rubutu.",
  "label.sendText": "Aika a matsayin rubutu (WhatsApp)",
  "label.paper": "A kan me za ka buga?",
  "label.sticker": "Label printer",
  "label.a4": "Takardar A4",
  "label.stickerHint": "Sticker ɗaya 4 × 6 inch, don label printer.",
  "label.a4Hint": "Kowane printer. Yanke shi ka manna.",
  "label.deliverTo": "Kai wa",
  "label.pickup": "Abokin ciniki zai zo ya karɓa",
  "label.collect": "Karɓi {amount} lokacin isarwa",
  "label.paid": "An biya. Kar a karɓi kuɗi",
  "label.items": "{count, plural, one {kaya #} other {kaya #}}",
  "label.from": "Daga {shop}",
  "label.fromPhone": "Daga · {phone}",
  "label.track": "Bibiya: {url}",
  "label.qr": "QR code don bibiyar wannan oda",
  "label.expired": "Wannan link na bugawa ya ƙare. Koma app ka sake taɓa Buga.",
};

export default ha;
