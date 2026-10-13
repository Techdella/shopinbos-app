// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  pill: "Kọ́ ẹ̀kọ́",
  pillTitle: "{title} ní ìṣẹ́jú kan",
  eyebrow: "Kọ́ ẹ̀kọ́ · ìṣẹ́jú-àáyá {seconds}",
  in60: "ní ìṣẹ́jú kan",
  skip: "Fò ó",
  close: "Padé",
  replay: "Tún un wò",
  replayFromStart: "Tún un bẹ̀rẹ̀ láti ìbẹ̀rẹ̀",
  gotIt: "Ó yé mi",
  next: "Èyí tó kàn",
  previousScene: "Apá tó ṣáájú",
  nextScene: "Apá tó kàn",
  play: "Bẹ̀rẹ̀",
  pause: "Dá a dúró",
  scenes: "Àwọn apá",
  sceneOf: "Apá {n} nínú {total}: {caption}",
  sceneProgress: "Apá {n} nínú {total}",
  howToWatch: "Bí o ṣe fẹ́ wò ó",
  animated: "Àwòrán tó ń rìn",
  watchVideo: "Wo fídíò",
  wordToKnow: "Ọ̀rọ̀ tí o gbọ́dọ̀ mọ̀",
  forExample: "Fún àpẹẹrẹ: {example}",
  forExampleLabel: "Fún àpẹẹrẹ",
  eg: "Àpẹẹrẹ: {example}",
  thatsIt: "Ó parí. O ti mọ {term} báyìí.",
  replayHint: "O lè tún un wò nígbàkúùgbà láti “Kọ́ ẹ̀kọ́ · 60s” lókè ojú-ewé yìí.",
  watchIntro: "Wo àlàyé ìṣẹ́jú kan",
  watchIntroLong: "Wo àlàyé ìṣẹ́jú kan",
  whatItMeans: "{term}: ohun tó túmọ̀ sí",
  whatItMeansSr: ", ohun tó túmọ̀ sí",
  explains: "Ó ṣàlàyé {term}",
};

export default yo;
