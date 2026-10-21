// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  "status.yours": "Status rẹ",
  "status.add": "Fi status kan sílẹ̀",
  "status.yoursOpen": "Wo status rẹ",
  "status.openOf": "Wo status {name}",
  "status.views": "Èèyàn {count} ló ti wò ó",
  "role.seller": "Ṣọ́ọ̀bù",
  "role.supplier": "Olùpèsè",
  "role.partner": "Alábàáṣiṣẹ́ ìfijiṣẹ́",
  "ago.minutes": "ìṣẹ́jú {count} sẹ́yìn",
  "ago.hours": "wákàtí {count} sẹ́yìn",
  "close": "Pa á dé",
  "previous": "Èyí tó ṣáájú",
  "next": "Èyí tó kàn",
  "like": "Fẹ́ràn rẹ̀",
  "unlike": "Yọ ìfẹ́ràn kúrò",
  "level.open": "Ìpele {level}: wo àwọn ẹ̀bùn rẹ",
  "level.openPlain": "Wo àwọn ẹ̀bùn rẹ",
  "level.short": "Ìp {level}",
  "check.count": "{done} nínú {total} ti parí",
  "check.hide": "Fi àkójọ yìí pamọ́",
  "tour.step": "Ìgbésẹ̀ {step} nínú {total}",
  "tour.skip": "Fò ó",
  "tour.next": "Tẹ̀síwájú",
  "tour.done": "Ó yé mi",
};

export default yo;
