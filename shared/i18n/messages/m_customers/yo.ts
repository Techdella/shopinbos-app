// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  "row.orders": "{count, plural, one {order #} other {order #}}",
  showing: "À ń fi {shown} hàn nínú {total}",
  more: "Fi síi hàn",
  call: "Pè",
  whatsapp: "WhatsApp",
  "contact.phone": "Fóònù",
  "contact.email": "Email",
  "contact.none": "Oníbàárà yìí kò fi nọ́mbà fóònù tàbí email sílẹ̀.",
  "chat.openChats": "Ṣí i nínú Chats",
  "chat.none": "Kò sí ọ̀rọ̀ kankan síbẹ̀. Ohun tí o bá fi ránṣẹ́ níbí yóò tún hàn nínú Chats.",
  "chat.sentHere": "Ó ti lọ. Wàá tún rí i nínú Chats.",
  "wa.templateHow": "Orí wẹ́ẹ̀bù ni o ti ń ṣe template, WhatsApp sì máa ń yẹ ọ̀kọ̀ọ̀kan wò kí o tó lè lò ó.",
  "wa.templateChosen": "Ò ń fi message template tí wọ́n ti fọwọ́ sí ránṣẹ́.",
  "wa.change": "Yí i padà",
  "msg.notSent": "Kò lọ",
  "msg.read": "Wọ́n ti kà á",
  "msg.delivered": "Ó ti dé",
  "msg.sending": "Ó ń lọ…",
};

export default yo;
