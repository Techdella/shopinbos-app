// The app's own 404 and error pages (src/components/errors, src/app/error.tsx, global-error.tsx, not-found.tsx).
// Storefront error pages speak for the seller's shop and stay untranslated. The witty lines mirror the app pools
// in src/components/errors/copy.ts (same order): "quip.<pool>.<n>".
const en = {
  "portal.seller": "Seller",
  "portal.supplier": "Supplier",
  "portal.logistics_partner": "Logistics",
  "home.seller": "Go to my dashboard",
  "home.supplier": "Go to supplier home",
  "home.logistics_partner": "Go to logistics home",
  "search.seller": "Search products, orders, suppliers...",
  "search.supplier": "Search products, orders, buyers...",
  "search.logistics_partner": "Search bookings, sellers, couriers...",

  goHome: "Go home",
  goBack: "Go back",
  askPeggy: "Ask Peggy",
  tryAgain: "Try again",
  reloadNow: "Reload now",

  "notFound.eyebrowPortal": "404 · {portal} workspace",
  "notFound.eyebrow": "404 · Page not found",
  "notFound.title": "We couldn't find that page",
  "notFound.body": "The link may be old or mistyped, or the page has moved. Nothing is lost: your store, orders and money are exactly where you left them.",

  "update.eyebrow": "Update · New version",
  "update.title": "Shopinbos just got an update — reloading…",
  "update.body": "We shipped something new while this tab was open. Fetching the fresh version now; your work is safe.",

  "error.eyebrowPortal": "Error · {portal} workspace",
  "error.eyebrow": "Error · Something went wrong",
  "error.title": "This page didn't load",
  "error.body": "Something on our side failed while loading this page. Your data is safe. Try again in a moment; if it keeps happening, send us the reference below so we can find it fast.",
  "error.pageTitle": "Something went wrong",

  // ErrorScene's own buttons
  "scene.another": "Tell me another",
  "scene.ref": "Ref {ref}",
  "scene.copy": "Copy",
  "scene.copied": "Copied",
  "scene.copyRef": "Copy error reference for support",
  "scene.refCopied": "Reference copied",

  "quip.notFound.1": "Omo, this page don japa.",
  "quip.notFound.2": "It's not you, it's Rex. He moved this page and forgot to tell anyone.",
  "quip.notFound.3": "Even Peggy searched everywhere. Nothing.",
  "quip.notFound.4": "Peggy has checked under every shelf with her magnifier. No sign of this page.",
  "quip.notFound.5": "We sent a dispatch rider. He's still circling the roundabout looking for this address.",
  "quip.notFound.6": "This page went to buy suya and never came back.",
  "quip.error.1": "It's not you, it's Rex. He's tightening a loose bolt as we speak.",
  "quip.error.2": "Something broke. Rex is already on it with his spanner.",
  "quip.error.3": "Our server took small break. E go soon wake.",
  "quip.error.4": "Small wahala. Nothing we can't fix.",
  "quip.error.5": "Rex tightened the wrong bolt. He is very sorry.",
  "quip.error.6": "Light blinked on our side. The generator is warming up.",
  "quip.global.1": "Rex is fixing, Peggy is looking. You just relax.",
  "quip.global.2": "It's not you, it's Rex. Peggy is helping him find the loose wire.",
  "quip.global.3": "Small wahala. Rex has the spanner, Peggy has the magnifier.",
  "quip.update.1": "Rex is bolting in the fresh parts. Back in a blink.",
} satisfies Record<string, string>;

export default en;
