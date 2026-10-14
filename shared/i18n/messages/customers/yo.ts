// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  title: "Àwọn oníbàárà",
  sub: "Oníbàárà {count} · {repeat} padà wá rà lẹ́ẹ̀kan sí i",
  subEmpty: "Gbogbo ẹni tó ti rà lọ́wọ́ rẹ, láti store rẹ tàbí títà tí o kọ sílẹ̀.",
  "stat.customers": "Àwọn oníbàárà",
  "stat.allTime": "Láti ìbẹ̀rẹ̀",
  "stat.repeat": "Àwọn tó ń padà wá rà",
  "stat.repeatHint": "Rà ju ẹ̀ẹ̀kan lọ",
  "stat.orders": "Àwọn order",
  "stat.delivered": "Ó ti dé",
  "stat.deliveredHint": "Àwọn order tó ti dé",
  empty: "Kò sí oníbàárà síbẹ̀",
  emptySub: "Nígbà tí ẹnìkan bá rà láti store rẹ, tàbí tí o kọ títà sílẹ̀, wọn yóò hàn níbí.",
  recordSale: "Kọ títà sílẹ̀",
  "badge.vip": "VIP",
  "badge.repeat": "Ó ń padà wá",
  "badge.new": "Tuntun",
  lastOrder: "Order tó kẹ́yìn {when}",
  onDate: "ní {date}",
  showing: "À ń fi {shown} tuntun jù hàn nínú oníbàárà {total}.",
};

export default yo;
