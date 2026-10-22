// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  supportReplied: "Support don reply",
  needHelp: "You need help?",
  askPeggy: "Ask Peggy",
  talkToPerson: "Talk to person",
  peggySubtitle: "AI helper · real person dey one tap away",
  personSubtitle: "Real person go reply, for English or Pidgin",
  backToHelp: "Go back to help",
  closeHelp: "Close help",
  loadFailed: "We no fit load your conversations.",
  openFailed: "We no fit open that conversation.",

  supportTeam: "You dey for the support team.",
  openDesk: "Open the support desk",
  peggyHint: "Quick answers on how to do things for Shopinbos",
  repliesWithinHour: "Dem dey usually reply under one hour",
  whatsappOrEmail: "WhatsApp or email the team",
  yourConversations: "Your conversations",
  noConversations: "No conversation yet. When you talk to the team, e go show here.",
  newReply: ", new reply",
  orEmail: "or email",
  callPeggyHint: "Talk am with Peggy, Shopinbos AI support. E free.",
  emailUs: "Email us",
  emailUsHint: "Write to the team without comot from the app",
  emailTo: "To",
  emailSubject: "Subject",
  emailSubjectPlaceholder: "Wetin e concern?",
  emailIntro: "We go reply here and by email, normally within one hour.",
  emailSend: "Send email",
  emailNeedsSubject: "Put subject.",

  greeting: "How far! Ask me how to do anything for Shopinbos: to build your store, products, orders, payments or delivery. For account wahala, tap \"Talk to person\".",
  peggyCouldntAnswer: "I no fit answer now. Tap \"Talk to person\" and the team go reply.",
  peggyUnreachable: "I no fit reach the help assistant. Check your network, or tap \"Talk to person\".",
  thinking: "I dey think…",
  howDoI: "How I go take…",
  send: "Send",

  tellUs: "Tell us wetin dey happen.",
  personIntro: "Person from Shopinbos team go reply here, usually under one hour. We go email you too.",
  includePeggy: " We go add your chat with Peggy so you no go need talk am again.",
  yourMessage: "Your message",
  messagePlaceholder: "Wetin happen, and wetin you dey try do. Order number go help.",
  addScreenshots: "Add screenshots",

  fallbackIntro: "Message the team and real person go reply, for English or Pidgin.",
  whatsappTeam: "WhatsApp the team",

  watchVideo: "Watch 1-minute video",
  allVideos: "All videos ({count})",
  closeVideo: "Close video",
  "duration.min": "{count} min",
  "duration.sec": "{count} sec",
};

export default pcm;
