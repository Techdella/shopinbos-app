// "Do it on your phone" copy: the QR card on the computer's selfie and ID screens, and the phone page it opens
// (/verify/phone/[token]). English is the source of truth; every key must exist in pcm.ts, yo.ts, ha.ts and ig.ts.
const en = {
  "card.title": "Do it on your phone",
  "card.subSelfie": "Scan this code with your phone's camera and take the selfie there. This page moves on by itself when it's done.",
  "card.subId": "Scan this code with your phone's camera and take the photo of your ID there. This page moves on by itself when it's done.",
  "card.qrLabel": "QR code that opens this step on your phone",
  "card.orLink": "Or open this link on your phone:",
  "card.copy": "Copy link",
  "card.copied": "Copied",
  "card.waiting": "Waiting for your phone…",
  "card.expired": "This code has expired.",
  "card.newCode": "Show a new code",
  "card.failed": "We couldn't make a phone link. Use this computer's camera instead.",
  "card.useComputer": "Use this computer's camera instead",
  "card.usePhone": "Do it on your phone instead",
  "card.cameraFailed": "This computer's camera didn't start. Scan the code with your phone instead:",
  "page.metaTitle": "Verify on your phone",
  "page.send": "Send",
  "page.doneTitle": "Done. Go back to your computer.",
  "page.doneBody": "Your computer moves on by itself in a few seconds. You can close this page.",
  "page.expiredTitle": "This link has expired",
  "page.expiredBody": "Links work for 20 minutes. Scan the new code on your computer.",
  "page.brokenTitle": "This link doesn't work",
  "page.brokenBody": "Scan the code on your computer again.",
  "page.needIdFirst": "Take the photo of your ID first, then the selfie.",
  "page.failed": "That didn't go through. Try again.",
} satisfies Record<string, string>;

export default en;
