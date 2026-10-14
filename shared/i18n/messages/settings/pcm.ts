// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "language.title": "Language",
  "language.sub": "The language wey Shopinbos go use for menu and buttons. You fit change am anytime.",
  "language.choose": "Choose your language",
  "language.current": "Na {language} you dey use now",
  "language.button": "Language: {language}",
  "language.changed": "Shopinbos don dey talk {language} now.",
  "language.draftNote": "Dis translation still new: some screens still dey for English. Tell us if any word no make sense.",
  "language.onboarding": "Rex and the app go use dis language. You fit change am anytime for Settings.",
  "language.saving": "We dey change the language…",
  "language.offline": "E don save for dis phone. We go save am for your account when network come back.",
};

export default pcm;
