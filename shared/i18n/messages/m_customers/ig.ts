// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "row.orders": "{count, plural, one {order #} other {order #}}",
  showing: "Na-egosi {shown} n'ime {total}",
  more: "Gosikwuo ọzọ",
  call: "Kpọọ",
  whatsapp: "WhatsApp",
  "contact.phone": "Ekwentị",
  "contact.email": "Email",
  "contact.none": "Onye ahịa a ahapụghị nọmba ekwentị ma ọ bụ email.",
  "chat.openChats": "Mepee ya na Chats",
  "chat.none": "Enweghị ozi ugbu a. Ihe ị zipuru ebe a ga-egosikwa na Chats.",
  "chat.sentHere": "Ezipụla ya. Ị ga-ahụkwa ya na Chats.",
  "wa.templateHow": "Ọ bụ na weebụ ka ị na-eme template, WhatsApp na-elelekwa nke ọ bụla tupu i nwee ike iji ya.",
  "wa.templateChosen": "Ị na-eziga message template a kwadoro.",
  "wa.change": "Gbanwee",
  "msg.notSent": "Ọ gaghị",
  "msg.read": "Agụọla ya",
  "msg.delivered": "Ọ rutere",
  "msg.sending": "Ọ na-aga…",
};

export default ig;
