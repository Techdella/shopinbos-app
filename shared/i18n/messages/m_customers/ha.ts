// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "row.orders": "{count, plural, one {oda #} other {oda #}}",
  showing: "Ana nuna {shown} cikin {total}",
  more: "Nuna ƙari",
  call: "Kira",
  whatsapp: "WhatsApp",
  "contact.phone": "Waya",
  "contact.email": "Email",
  "contact.none": "Wannan abokin ciniki bai bar lambar waya ko email ba.",
  "chat.openChats": "Buɗe a Hira",
  "chat.none": "Babu saƙo tukuna. Abin da ka aika a nan zai bayyana a Hira ma.",
  "chat.sentHere": "An aika. Za ka gan shi a Hira ma.",
  "wa.templateHow": "A shafin yanar gizo ake yin template, kuma WhatsApp na duba kowanne kafin ka iya amfani da shi.",
  "wa.templateChosen": "Kana aika message template da aka amince da shi.",
  "wa.change": "Canza",
  "msg.notSent": "Bai tafi ba",
  "msg.read": "An karanta",
  "msg.delivered": "Ya isa",
  "msg.sending": "Ana aikawa…",
};

export default ha;
