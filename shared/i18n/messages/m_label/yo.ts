// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  "label.title": "Label delivery",
  "label.sub": "Tẹ̀ ẹ́ jáde kí o lẹ̀ ẹ́ mọ́ parcel, tàbí fi ránṣẹ́ sí rider rẹ.",
  "label.loadFailed": "A kò lè gba label náà. Ṣàyẹ̀wò network rẹ, kí o tún gbìyànjú.",
  "label.print": "Tẹ̀ jáde tàbí pín in",
  "label.printOff": "Títẹ̀ jáde kò tíì ṣetán. Dípò bẹ́ẹ̀, fi label náà ránṣẹ́ bí ọ̀rọ̀.",
  "label.sendText": "Fi ránṣẹ́ bí ọ̀rọ̀ (WhatsApp)",
  "label.paper": "Kí lo máa tẹ̀ ẹ́ sí?",
  "label.sticker": "Label printer",
  "label.a4": "Bébà A4",
  "label.stickerHint": "Sticker kan 4 × 6 inch, fún label printer.",
  "label.a4Hint": "Printer èyíkéyìí. Gé e jáde, kí o lẹ̀ ẹ́ mọ́ parcel.",
  "label.deliverTo": "Fi jíṣẹ́ fún",
  "label.pickup": "Oníbàárà máa wá gbà á",
  "label.collect": "Gba {amount} nígbà delivery",
  "label.paid": "Wọ́n ti sanwó. Má ṣe gba owó",
  "label.items": "{count, plural, one {ọjà #} other {ọjà #}}",
  "label.from": "Láti ọ̀dọ̀ {shop}",
  "label.fromPhone": "Láti · {phone}",
  "label.track": "Tọpinpin rẹ̀: {url}",
  "label.qr": "QR code láti tọpinpin order yìí",
  "label.expired": "Link títẹ̀ jáde yìí ti parí. Padà sí app kí o tún tẹ Print.",
};

export default yo;
