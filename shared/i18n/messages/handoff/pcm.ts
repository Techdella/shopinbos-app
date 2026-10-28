// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "card.title": "Do am for your phone",
  "card.subSelfie": "Use your phone camera scan this code, then take the selfie for there. This page go move by itself once e done.",
  "card.subId": "Use your phone camera scan this code, then snap your ID for there. This page go move by itself once e done.",
  "card.qrLabel": "QR code wey go open this step for your phone",
  "card.orLink": "Or open this link for your phone:",
  "card.copy": "Copy link",
  "card.copied": "E don copy",
  "card.waiting": "We dey wait for your phone…",
  "card.expired": "This code don expire.",
  "card.newCode": "Show new code",
  "card.failed": "We no fit make phone link. Use this computer camera instead.",
  "card.useComputer": "Use this computer camera instead",
  "card.usePhone": "Do am for your phone instead",
  "card.cameraFailed": "This computer camera no start. Use your phone scan the code instead:",
  "page.metaTitle": "Verify for your phone",
  "page.send": "Send",
  "page.doneTitle": "E don do. Go back to your computer.",
  "page.doneBody": "Your computer go move by itself for few seconds. You fit close this page.",
  "page.expiredTitle": "This link don expire",
  "page.expiredBody": "Link dey work for 20 minutes. Scan the new code for your computer.",
  "page.brokenTitle": "This link no dey work",
  "page.brokenBody": "Scan the code for your computer again.",
  "page.needIdFirst": "Snap your ID first, then the selfie.",
  "page.failed": "E no go. Try again.",
};

export default pcm;
