// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  supportReplied: "Support azaala",
  needHelp: "Ị chọrọ enyemaka?",
  askPeggy: "Jụọ Peggy",
  talkToPerson: "Gwa mmadụ okwu",
  peggySubtitle: "Onye enyemaka AI · mmadụ dị otu mpịa",
  personSubtitle: "Ezigbo mmadụ ga-aza, n'asụsụ Bekee ma ọ bụ Pidgin",
  backToHelp: "Laghachi na enyemaka",
  closeHelp: "Mechie enyemaka",
  loadFailed: "Anyị enweghị ike iwete mkparịta ụka gị.",
  openFailed: "Anyị enweghị ike imeghe mkparịta ụka ahụ.",

  supportTeam: "Ị nọ na ndị otu support.",
  openDesk: "Mepee support desk",
  peggyHint: "Azịza ozugbo maka otu esi eme ihe na Shopinbos",
  repliesWithinHour: "Ha na-azakarị n'ime otu awa",
  whatsappOrEmail: "Zigara ndị otu ozi na WhatsApp ma ọ bụ email",
  yourConversations: "Mkparịta ụka gị",
  noConversations: "Enweghị mkparịta ụka ka ugbu a. Ọ bụrụ na ị gwa ndị otu okwu, ọ ga-apụta ebe a.",
  newReply: ", azịza ọhụrụ",
  orEmail: "ma ọ bụ email",
  callPeggyHint: "Gwa Peggy, AI support nke Shopinbos, okwu. Ọ bụ n'efu.",
  emailUs: "Zitere anyị email",
  emailUsHint: "Dee team akwụkwọ n'ahapụghị app",
  emailTo: "Nye",
  emailSubject: "Isiokwu",
  emailSubjectPlaceholder: "Gịnị ka ọ metụtara?",
  emailIntro: "Anyị ga-aza ebe a na site na email, ọtụtụ mgbe n'ime otu awa.",
  emailSend: "Zipu email",
  emailNeedsSubject: "Tinye isiokwu.",

  greeting: "Ndewo! Jụọ m otu esi eme ihe ọ bụla na Shopinbos: iwu ụlọ ahịa gị, ngwaahịa, orders, ịkwụ ụgwọ ma ọ bụ nnyefe. Maka nsogbu account, pịa \"Gwa mmadụ okwu\".",
  peggyCouldntAnswer: "Enweghị m ike ịza ugbu a. Pịa \"Gwa mmadụ okwu\" ndị otu ga-aza.",
  peggyUnreachable: "Enweghị m ike iru onye enyemaka. Lelee network gị, ma ọ bụ pịa \"Gwa mmadụ okwu\".",
  thinking: "Ana m eche echiche…",
  howDoI: "Kedu ka m ga-esi…",
  send: "Ziga",

  tellUs: "Gwa anyị ihe na-eme.",
  personIntro: "Onye si na ndị otu Shopinbos ga-aza ebe a, na-abụkarị n'ime otu awa. Anyị ga-ezigakwara gị email.",
  includePeggy: " Anyị ga-etinye mkparịta ụka gị na Peggy ka ị ghara ikwughachi ya.",
  yourMessage: "Ozi gị",
  messagePlaceholder: "Ihe mere, na ihe ị na-anwa ime. Nọmba order na-enye aka.",
  addScreenshots: "Tinye screenshots",

  fallbackIntro: "Zigara ndị otu ozi, ezigbo mmadụ ga-aza, n'asụsụ Bekee ma ọ bụ Pidgin.",
  whatsappTeam: "Zigara ndị otu ozi na WhatsApp",

  watchVideo: "Lelee vidiyo nkeji otu",
  allVideos: "Vidiyo niile ({count})",
  closeVideo: "Mechie vidiyo",
  "duration.min": "nkeji {count}",
  "duration.sec": "sekọnd {count}",
};

export default ig;
