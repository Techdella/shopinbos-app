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
  // Peggy's "can I help?" nudge when someone looks stuck (src/components/peggy/PeggyNudge.tsx).
  "nudge.label": "Peggy can help",
  "nudge.error.title": "That didn't work. Want a hand?",
  "nudge.error.body": "I'm Peggy. Tell me what you were trying to do and I'll help you sort it out.",
  "nudge.error.opener": "I saw something went wrong just now. What were you trying to do? I'll walk you through it, or get someone from the team to help.",
  "nudge.rage.title": "Is something not responding?",
  "nudge.rage.body": "Looks like that isn't doing what you expect. I can help you get past it.",
  "nudge.rage.opener": "Looks like something isn't responding when you tap it. Which button or page is it? I'll help you get past it.",
  "nudge.scroll.title": "Looking for something?",
  "nudge.scroll.body": "Tell me what you need and I'll take you straight there.",
  "nudge.scroll.opener": "Looking for something? Tell me what you need, like an order, a product or a setting, and I'll tell you exactly where it is.",
  "nudge.wander.title": "Can't find where something is?",
  "nudge.wander.body": "Tell me what you want to do and I'll point you to the right page.",
  "nudge.wander.opener": "Can't find where something is? Tell me what you want to do and I'll point you to the right page.",
  "nudge.yes": "Yes, help me",
  "nudge.no": "I'm fine",
  "nudge.never": "Don't offer again",
} satisfies Record<string, string>;

export default en;
