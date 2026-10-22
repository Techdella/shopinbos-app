// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  supportReplied: "Support ti fèsì",
  needHelp: "Ṣé o nílò ìrànlọ́wọ́?",
  askPeggy: "Bi Peggy",
  talkToPerson: "Bá ènìyàn sọ̀rọ̀",
  peggySubtitle: "Olùrànlọ́wọ́ AI · ènìyàn kan wà ní ìtẹ̀ kan",
  personSubtitle: "Ènìyàn gidi ló máa fèsì, ní English tàbí Pidgin",
  backToHelp: "Padà sí ìrànlọ́wọ́",
  closeHelp: "Pa ìrànlọ́wọ́ dé",
  loadFailed: "A kò lè gbé àwọn ìjíròrò rẹ wá.",
  openFailed: "A kò lè ṣí ìjíròrò yẹn.",

  supportTeam: "O wà nínú ẹgbẹ́ support.",
  openDesk: "Ṣí support desk",
  peggyHint: "Ìdáhùn kíákíá nípa bí a ṣe ń ṣe nǹkan lórí Shopinbos",
  repliesWithinHour: "Wọ́n sábà máa ń fèsì láàrín wákàtí kan",
  whatsappOrEmail: "Kọ sí ẹgbẹ́ náà lórí WhatsApp tàbí email",
  yourConversations: "Àwọn ìjíròrò rẹ",
  noConversations: "Kò sí ìjíròrò kankan síbẹ̀. Tí o bá bá ẹgbẹ́ náà sọ̀rọ̀, wọ́n máa hàn níbí.",
  newReply: ", ìfèsì tuntun",
  orEmail: "tàbí email",
  callPeggyHint: "Bá Peggy, AI support Shopinbos, sọ̀rọ̀. Ọ̀fẹ́ ni.",
  emailUs: "Fi email ránṣẹ́ sí wa",
  emailUsHint: "Kọ̀wé sí team láì kúrò nínú app",
  emailTo: "Sí",
  emailSubject: "Àkòrí",
  emailSubjectPlaceholder: "Kí ló kàn?",
  emailIntro: "A máa fèsì níbí àti nípa email, nígbà púpọ̀ láàrin wákàtí kan.",
  emailSend: "Fi email ránṣẹ́",
  emailNeedsSubject: "Fi àkòrí sí i.",

  greeting: "Ẹ kú àbọ̀! Bi mí bí a ṣe ń ṣe ohunkóhun lórí Shopinbos: kíkọ́ ṣọ́ọ̀bù rẹ, ọjà, order, ìsanwó tàbí ìfiránṣẹ́. Fún ìṣòro account, tẹ \"Bá ènìyàn sọ̀rọ̀\".",
  peggyCouldntAnswer: "Mi ò lè dáhùn báyìí. Tẹ \"Bá ènìyàn sọ̀rọ̀\" ẹgbẹ́ náà á sì fèsì.",
  peggyUnreachable: "Mi ò lè dé ọ̀dọ̀ olùrànlọ́wọ́. Ṣàyẹ̀wò network rẹ, tàbí tẹ \"Bá ènìyàn sọ̀rọ̀\".",
  thinking: "Mò ń ronú…",
  howDoI: "Báwo ni mo ṣe…",
  send: "Fi ránṣẹ́",

  tellUs: "Sọ ohun tó ń ṣẹlẹ̀ fún wa.",
  personIntro: "Ẹnìkan láti ẹgbẹ́ Shopinbos máa fèsì níbí, nígbà púpọ̀ láàrín wákàtí kan. A tún máa fi email ránṣẹ́ sí ọ.",
  includePeggy: " A máa fi ìjíròrò rẹ pẹ̀lú Peggy kún un, kí o má baà tún un sọ.",
  yourMessage: "Ọ̀rọ̀ rẹ",
  messagePlaceholder: "Ohun tó ṣẹlẹ̀, àti ohun tí o ń gbìyànjú láti ṣe. Nọ́ńbà order máa ràn wá lọ́wọ́.",
  addScreenshots: "Fi screenshot kún un",

  fallbackIntro: "Kọ sí ẹgbẹ́ náà, ènìyàn gidi á sì fèsì, ní English tàbí Pidgin.",
  whatsappTeam: "Kọ sí ẹgbẹ́ náà lórí WhatsApp",

  watchVideo: "Wo fídíò ìṣẹ́jú kan",
  allVideos: "Gbogbo fídíò ({count})",
  closeVideo: "Pa fídíò dé",
  "duration.min": "ìṣẹ́jú {count}",
  "duration.sec": "ìṣẹ́jú-àáyá {count}",
};

export default yo;
