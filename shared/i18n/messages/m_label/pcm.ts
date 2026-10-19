// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "label.title": "Shipping label",
  "label.sub": "Print am, paste am for the parcel, or send am give your rider.",
  "label.loadFailed": "We no fit get the label. Check your network, then try again.",
  "label.print": "Print or share",
  "label.printOff": "Printing never ready. Send the label as text instead.",
  "label.sendText": "Send am as text (WhatsApp)",
  "label.paper": "Wetin you go print am on?",
  "label.sticker": "Label printer",
  "label.a4": "A4 paper",
  "label.stickerHint": "One 4 × 6 inch sticker, for label printers.",
  "label.a4Hint": "Any printer. Cut am, then tape am for the parcel.",
  "label.deliverTo": "Deliver give",
  "label.pickup": "Customer go come pick am",
  "label.collect": "Collect {amount} when you deliver",
  "label.paid": "Dem don pay. No collect money",
  "label.items": "{count, plural, one {# item} other {# items}}",
  "label.from": "From {shop}",
  "label.fromPhone": "From · {phone}",
  "label.track": "Track am: {url}",
  "label.qr": "QR code to track this order",
  "label.expired": "This print link don expire. Go back to the app, tap Print again.",
};

export default pcm;
