// Built-in words of the shared UI kits (src/components/app-ui, ui, simple) and the little labels drawn inside the
// 60-second intro scenes (src/components/learn/scenes.tsx, "scene.*").
const en = {
  // app-ui
  back: "Back",
  countryCode: "Country code",
  previewSize: "Preview size",
  computerView: "Computer view",
  phoneView: "Phone view",
  verificationCode: "Verification code",
  digit: "Digit {n}",
  stepOf: "Step {n} of {total}",

  // ui
  confirm: "Confirm",
  dismiss: "Dismiss",

  // simple/Fold
  techDetails: "Show the technical details (for {forWho})",
  advanced: "Advanced (optional)",

  // Intro scenes
  "scene.paid": "PAID",
  "scene.newIn": "New in · Shop now",
  "scene.inStock": "IN STOCK",
  "scene.lowStock": "Low stock",
  "scene.updated": "Updated",
  "scene.secure": "Secure ✓",
  "scene.supplier": "SUPPLIER",
  "scene.customer": "CUSTOMER",
  "scene.shop": "SHOP",
  "scene.runsItself": "RUNS BY ITSELF · 24/7",
  "scene.stillWant": "Still want it?",
  "scene.tapToFinish": "Tap to finish",
  "scene.deal": "Deal ✓",
  "scene.cashAtDoor": "CASH AT THE DOOR",
  // Logged in on another portal's page: why they landed on their own home (components/auth/PortalNote.tsx)
  "portalNote.seller": "You have a seller account, so we opened your shop.",
  "portalNote.supplier": "You have a supplier account, so we opened your supplier portal.",
  "portalNote.logistics_partner": "You have a delivery partner account, so we opened your delivery portal.",
  "portalNote.admin": "You have an admin account, so we opened the admin panel.",
  "dialog.ok": "OK",
  "dialog.continue": "Continue",
  "dialog.done": "Done",
  "dialog.copy": "Copy",
  "dialog.copied": "Copied",
} satisfies Record<string, string>;

export default en;
