// The in-app help panel (src/components/shell/SupportChatModal.tsx) and its one-minute videos
// (src/components/help/HelpVideos.tsx). Ticket statuses and topics are in the "support" namespace.
const en = {
  supportReplied: "Support replied",
  needHelp: "Need help?",
  askPeggy: "Ask Peggy",
  talkToPerson: "Talk to a person",
  peggySubtitle: "AI help assistant · a person is one tap away",
  personSubtitle: "A real person replies, in English or Pidgin",
  backToHelp: "Back to help",
  closeHelp: "Close help",
  loadFailed: "We couldn't load your conversations.",
  openFailed: "We couldn't open that conversation.",

  // Home view
  supportTeam: "You're on the support team.",
  openDesk: "Open the support desk",
  peggyHint: "Instant answers on how to do things in Shopinbos",
  repliesWithinHour: "Usually replies within an hour",
  whatsappOrEmail: "WhatsApp or email the team",
  yourConversations: "Your conversations",
  noConversations: "No conversations yet. When you talk to the team, they'll show up here.",
  newReply: ", new reply",
  orEmail: "or email",
  callPeggyHint: "Talk it through with Peggy, Shopinbos's AI support. Free.",
  emailUs: "Email us",
  emailUsHint: "Write to the team without leaving the app",
  emailTo: "To",
  emailSubject: "Subject",
  emailSubjectPlaceholder: "What's it about?",
  emailIntro: "We'll reply here and by email, usually within an hour.",
  emailSend: "Send email",
  emailNeedsSubject: "Add a subject.",

  // Ask Peggy
  greeting: "Hi! Ask me how to do anything in Shopinbos: building your store, products, orders, payments or delivery. For account problems, tap \"Talk to a person\".",
  peggyCouldntAnswer: "I couldn't answer just now. Tap \"Talk to a person\" and the team will reply.",
  peggyUnreachable: "I couldn't reach the help assistant. Check your connection, or tap \"Talk to a person\".",
  thinking: "Thinking…",
  howDoI: "How do I…",
  send: "Send",

  // New ticket
  tellUs: "Tell us what's going on.",
  personIntro: "A person from the Shopinbos team will reply here, usually within an hour. We'll email you too.",
  includePeggy: " We'll include your chat with Peggy so you don't have to repeat yourself.",
  yourMessage: "Your message",
  messagePlaceholder: "What happened, and what you were trying to do. Order numbers help.",
  addScreenshots: "Add screenshots",

  // Before support is set up
  fallbackIntro: "Message the team and a real person will reply, in English or Pidgin.",
  whatsappTeam: "WhatsApp the team",

  // Videos
  watchVideo: "Watch a 1-minute video",
  allVideos: "All videos ({count})",
  closeVideo: "Close video",
  "duration.min": "{count} min",
  "duration.sec": "{count} sec",
} satisfies Record<string, string>;

export default en;
