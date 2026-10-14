// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  back: "Go back",
  countryCode: "Country code",
  previewSize: "Preview size",
  computerView: "Computer view",
  phoneView: "Phone view",
  verificationCode: "Verification code",
  digit: "Number {n}",
  stepOf: "Step {n} of {total}",
  confirm: "Confirm",
  dismiss: "Comot am",
  techDetails: "Show the technical details (for {forWho})",
  advanced: "Advanced (no be must)",
  "scene.paid": "E DON PAY",
  "scene.newIn": "New one don land · Buy now",
  "scene.inStock": "E DEY",
  "scene.lowStock": "E don dey finish",
  "scene.updated": "E don update",
  "scene.secure": "E safe ✓",
  "scene.supplier": "SUPPLIER",
  "scene.customer": "CUSTOMER",
  "scene.shop": "SHOP",
  "scene.runsItself": "E DEY RUN BY ITSELF · 24/7",
  "scene.stillWant": "You still want am?",
  "scene.tapToFinish": "Tap to finish",
  "scene.deal": "Deal don set ✓",
  "scene.cashAtDoor": "CASH FOR DOOR",
};

export default pcm;
