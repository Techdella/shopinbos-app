// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  supportReplied: "Support sun amsa",
  needHelp: "Kana buƙatar taimako?",
  askPeggy: "Tambayi Peggy",
  talkToPerson: "Yi magana da mutum",
  peggySubtitle: "Mataimakin AI · mutum yana nan a taɓawa ɗaya",
  personSubtitle: "Mutum na gaske zai amsa, da Turanci ko Pidgin",
  backToHelp: "Koma taimako",
  closeHelp: "Rufe taimako",
  loadFailed: "Ba mu iya kawo tattaunawarka ba.",
  openFailed: "Ba mu iya buɗe wannan tattaunawa ba.",

  supportTeam: "Kana cikin ƙungiyar support.",
  openDesk: "Buɗe support desk",
  peggyHint: "Amsoshi nan take kan yadda ake yin abubuwa a Shopinbos",
  repliesWithinHour: "Yawanci suna amsawa cikin awa ɗaya",
  whatsappOrEmail: "Tura wa ƙungiyar saƙo ta WhatsApp ko email",
  yourConversations: "Tattaunawarka",
  noConversations: "Babu tattaunawa tukuna. Idan ka yi magana da ƙungiyar, za ta bayyana a nan.",
  newReply: ", sabuwar amsa",
  orEmail: "ko email",

  greeting: "Sannu! Tambaye ni yadda ake yin komai a Shopinbos: gina shagonka, kayayyaki, orders, biyan kuɗi ko kai kaya. Don matsalar account, danna \"Yi magana da mutum\".",
  peggyCouldntAnswer: "Ban iya amsawa yanzu ba. Danna \"Yi magana da mutum\" ƙungiyar za ta amsa.",
  peggyUnreachable: "Ban iya isa ga mataimakin taimako ba. Duba network ɗinka, ko danna \"Yi magana da mutum\".",
  thinking: "Ina tunani…",
  howDoI: "Yaya zan…",
  send: "Aika",

  tellUs: "Faɗa mana abin da ke faruwa.",
  personIntro: "Wani daga ƙungiyar Shopinbos zai amsa a nan, yawanci cikin awa ɗaya. Za mu aiko maka email ma.",
  includePeggy: " Za mu haɗa da hirarka da Peggy don kada ka sake faɗa.",
  yourMessage: "Saƙonka",
  messagePlaceholder: "Abin da ya faru, da abin da kake ƙoƙarin yi. Lambar order za ta taimaka.",
  addScreenshots: "Ƙara screenshots",

  fallbackIntro: "Tura wa ƙungiyar saƙo, mutum na gaske zai amsa, da Turanci ko Pidgin.",
  whatsappTeam: "Tura wa ƙungiyar saƙo ta WhatsApp",

  watchVideo: "Kalli bidiyo na minti ɗaya",
  allVideos: "Duk bidiyoyi ({count})",
  closeVideo: "Rufe bidiyo",
  "duration.min": "minti {count}",
  "duration.sec": "daƙiƙa {count}",
};

export default ha;
