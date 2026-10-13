// Rex (AI copy and setup helper), the voice input button and the AI studio (logo and images).
// English is the source of truth; every key must exist in pcm.ts, yo.ts, ha.ts and ig.ts.
const en = {
  // Write with Rex (components/marketing/RexAICopywriter.tsx)
  "copy.failed": "Rex couldn't write that. Try again.",
  "copy.offline": "Couldn't reach Rex. Check your connection and try again.",
  "copy.copyFailed": "Couldn't copy. Select the text and copy it.",
  "copy.button": "Write with Rex",
  "copy.intro": "Rex writes subject lines, messages and captions for {store}. Pick what you need.",
  "copy.yourShop": "your shop",
  "copy.what": "What should Rex write?",
  "copy.choose": "Choose",
  "copy.write": "Write {what}",
} satisfies Record<string, string>;

export default en;
