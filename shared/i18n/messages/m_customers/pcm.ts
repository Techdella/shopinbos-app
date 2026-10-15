// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "row.orders": "{count, plural, one {# order} other {# orders}}",
  showing: "Na {shown} out of {total} dey show",
  more: "Show more",
  call: "Call",
  whatsapp: "WhatsApp",
  "contact.phone": "Phone",
  "contact.email": "Email",
  "contact.none": "This customer no leave phone number or email.",
  "chat.openChats": "Open am for Chats",
  "chat.none": "No message yet. Wetin you send here go also show for Chats.",
  "chat.sentHere": "E don go. You go see am for Chats too.",
  "wa.templateHow": "Na for web you dey make template, and WhatsApp go check each one before you fit use am.",
  "wa.templateChosen": "You dey send message template wey dem don approve.",
  "wa.change": "Change am",
  "msg.notSent": "E no go",
  "msg.read": "Dem don read",
  "msg.delivered": "E don reach",
  "msg.sending": "E dey go…",
};

export default pcm;
