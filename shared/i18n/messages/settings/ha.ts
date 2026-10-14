// Draft: needs native-speaker review
import type en from "./en.ts";

const ha: Partial<Record<keyof typeof en, string>> = {
  "language.title": "Harshe",
  "language.sub": "Harshen da Shopinbos zai yi amfani da shi a menu da maɓallai. Za ka iya canza shi kowane lokaci.",
  "language.choose": "Zaɓi harshenka",
  "language.current": "Harshen da kake amfani da shi: {language}",
  "language.button": "Harshe: {language}",
  "language.changed": "Shopinbos yanzu yana magana da {language}.",
  "language.draftNote": "Fassarar sabuwa ce: wasu shafuka har yanzu suna cikin Turanci. Ka faɗa mana idan wata kalma ba ta yi daidai ba.",
  "language.onboarding": "Rex da app za su yi amfani da wannan harshe. Za ka iya canza shi kowane lokaci a Saituna.",
  "language.saving": "Ana canza harshe…",
  "language.offline": "An ajiye a wannan wayar. Za mu ajiye a asusunka idan network ya dawo.",
};

export default ha;
