// Draft: needs native-speaker review
import type en from "./en.ts";

const ig: Partial<Record<keyof typeof en, string>> = {
  "row.orders": "{count, plural, other {order #}}",
  showing: "Na-egosi {shown} n'ime {total}",
  more: "Gosikwuo ọzọ",
  call: "Kpọọ",
  whatsapp: "WhatsApp",
  "contact.phone": "Ekwentị",
  "contact.email": "Email",
  "contact.none": "Onye ahịa a ahapụghị nọmba ekwentị ma ọ bụ email.",
  "chat.openChats": "Mepee ya na Chats",
  "chat.none": "Ọ dịbeghị ozi. Ihe ị zipuru ebe a ga-egosikwa na Chats.",
  "chat.sentHere": "Ezipụla ya. Ị ga-ahụkwa ya na Chats.",
  "wa.templateHow": "Ọ bụ na weebụ ka ị na-eme template, WhatsApp na-elelekwa nke ọ bụla tupu i nwee ike iji ya.",
  "wa.templateChosen": "Ị na-eziga template ozi WhatsApp kwadoro.",
  "wa.change": "Gbanwee",
  "msg.notSent": "Eziteghị ya",
  "msg.read": "Agụọla ya",
  "msg.delivered": "Erutela",
  "msg.sending": "Ọ na-eziga…",
};

export default ig;
