// Draft: needs native-speaker review
import type en from "./en.ts";

const pcm: Partial<Record<keyof typeof en, string>> = {
  "portal.seller": "Seller",
  "portal.supplier": "Supplier",
  "portal.logistics_partner": "Logistics",
  "home.seller": "Go my dashboard",
  "home.supplier": "Go supplier home",
  "home.logistics_partner": "Go logistics home",
  "search.seller": "Find products, orders, suppliers...",
  "search.supplier": "Find products, orders, buyers...",
  "search.logistics_partner": "Find bookings, sellers, couriers...",

  goHome: "Go home",
  goBack: "Go back",
  askPeggy: "Ask Peggy",
  tryAgain: "Try again",
  reloadNow: "Reload am now",

  "notFound.eyebrowPortal": "404 · {portal} workspace",
  "notFound.eyebrow": "404 · We no see the page",
  "notFound.title": "We no fit find that page",
  "notFound.body": "The link fit don old or dem type am wrong, or the page don move. Nothing loss: your store, orders and money dey exactly where you leave dem.",

  "update.eyebrow": "Update · New version",
  "update.title": "Shopinbos just update — e dey reload…",
  "update.body": "We put something new while this tab dey open. We dey bring the fresh version now; your work dey safe.",

  "error.eyebrowPortal": "Error · {portal} workspace",
  "error.eyebrow": "Error · Something no work",
  "error.title": "This page no load",
  "error.body": "Something for our side spoil while this page dey load. Your data dey safe. Try again small time; if e still dey happen, send us the reference wey dey down so we fit find am quick.",
  "error.pageTitle": "Something no work",

  "scene.another": "Tell me another one",
  "scene.ref": "Ref {ref}",
  "scene.copy": "Copy",
  "scene.copied": "E don copy",
  "scene.copyRef": "Copy the error reference for support",
  "scene.refCopied": "Reference don copy",

  "quip.notFound.1": "Omo, this page don japa.",
  "quip.notFound.2": "No be you, na Rex. E move this page and forget to tell anybody.",
  "quip.notFound.3": "Even Peggy search everywhere. Nothing.",
  "quip.notFound.4": "Peggy don check under every shelf with her magnifier. This page no dey anywhere.",
  "quip.notFound.5": "We send dispatch rider. E still dey circle the roundabout dey find this address.",
  "quip.notFound.6": "This page go buy suya and e never come back.",
  "quip.error.1": "No be you, na Rex. E dey tighten one loose bolt as we dey talk.",
  "quip.error.2": "Something spoil. Rex don already carry im spanner enter am.",
  "quip.error.3": "Our server take small break. E go soon wake.",
  "quip.error.4": "Small wahala. Nothing wey we no fit fix.",
  "quip.error.5": "Rex tighten the wrong bolt. E dey beg.",
  "quip.error.6": "Light blink for our side. Gen dey warm up.",
  "quip.global.1": "Rex dey fix, Peggy dey look. You just relax.",
  "quip.global.2": "No be you, na Rex. Peggy dey help am find the loose wire.",
  "quip.global.3": "Small wahala. Rex hold spanner, Peggy hold magnifier.",
  "quip.update.1": "Rex dey bolt the fresh parts enter. We go back now now.",
};

export default pcm;
