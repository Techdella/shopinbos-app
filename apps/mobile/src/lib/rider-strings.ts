import "expo-sqlite/localStorage/install";
import { useCallback, useState } from "react";

// Every word the Riders app shows, in one place so translators can add languages (spec 8A: English and Pidgin
// first, then Yorùbá and Hausa). To add a language: add its code to RIDER_LANGS and a full block to STRINGS.
// Pidgin here follows the prototype ("Same app in Pidgin"); have a native speaker check new lines before release.

export const RIDER_LANGS = [
  { code: "en", label: "English" },
  { code: "pcm", label: "Pidgin" },
] as const;

export type RiderLang = (typeof RIDER_LANGS)[number]["code"];

type Fill = Record<string, string | number>;
type Line = string | ((v: Fill) => string);

const en = {
  appName: "Shopinbos Riders",
  online: "You're online",
  offline: "You're offline",
  onlineHint: "Your company can give you jobs.",
  offlineHint: "Switch on when you're ready to work.",
  earnedToday: "Earned today",
  cashWithYou: "Cash with you",
  cashWithYouHint: "Pay it in by 6pm",
  newJob: "New delivery for you",
  carrying: "You're on a delivery",
  forYou: (v: Fill) => `${v.amount} for you`,
  collect: (v: Fill) => `Collect ${v.amount}`,
  parcels: (v: Fill) => (Number(v.count) === 1 ? "1 parcel" : `${v.count} parcels`),
  accept: "Take this delivery",
  continueJob: "Continue this delivery",
  noJobs: "No deliveries right now",
  noJobsOnline: "Your company gives you jobs here. Pull down to check again.",
  noJobsOffline: "Switch on when you're ready, so your company knows you can take jobs.",
  pickupT: "Go to the shop",
  have: "I have the parcel",
  dropT: (v: Fill) => `Take it to ${v.name}`,
  with: "I'm with the customer",
  codeT: (v: Fill) => `Ask ${v.name} for their delivery code`,
  codeHint: "The 4-digit code is on the customer's phone.",
  next: "Next",
  cashT: (v: Fill) => `Collect ${v.amount}`,
  cashHint: "Count it before you leave. Pay it in with the rest of today's cash by 6pm.",
  paidCash: "Cash",
  paidTransfer: "They sent a transfer",
  otherAmount: "They paid a different amount",
  got: "I collected it",
  delivered: "Delivered",
  doneT: "Delivered!",
  doneEarned: "Added to your earnings.",
  doneCash: (v: Fill) => `You now have ${v.amount} cash to pay in by 6pm.`,
  findNext: "Find the next delivery",
  openMap: "Open map",
  call: "Call",
  whatsapp: "WhatsApp",
  callCompany: (v: Fill) => `Call ${v.name}`,
  back: "Back",
  cantDeliver: "I couldn't deliver it",
  whyNot: "Why couldn't you deliver it?",
  reasons: ["Customer didn't pick up calls", "Customer not at the address", "Customer refused the parcel", "Wrong or incomplete address", "Customer couldn't pay"],
  photo: "Add a proof of delivery photo (optional)",
  photoDone: "Photo added",
  cameraOff: "Your camera is off. Allow camera for Shopinbos in your phone's settings.",
  typeAll4: "Type all 4 digits of the delivery code.",
  typeAmount: "Type how much the customer paid.",
  tryAgain: "Try again",
  removeLink: "Remove my Riders link from this phone",
  removeTitle: "Remove your Riders link from this phone?",
  removeBody: "You'll need the link from your company to open your deliveries again.",
  keep: "Keep it",
  remove: "Remove",
  newLink: "Use a new link",
  loading: "Loading your deliveries…",
  customer: "the customer",
  locAskT: "Share your location?",
  locAsk: "Shopinbos uses your location only while you're online, so we can give you jobs near you.",
  locYes: "Share my location",
  locNo: "Not now",
  locOn: "Sharing your location while you're online.",
  locOff: "Location is off. You still get jobs, but your company can't see who is closest.",
  locSettings: "Turn it on in settings",
} satisfies Record<string, Line | string[]>;

type Strings = typeof en;

const pcm: Strings = {
  appName: "Shopinbos Riders",
  online: "You dey online",
  offline: "You no dey online",
  onlineHint: "Your company fit give you work.",
  offlineHint: "On am when you ready to work.",
  earnedToday: "Wetin you make today",
  cashWithYou: "Cash wey dey your hand",
  cashWithYouHint: "Pay am in before 6pm",
  newJob: "New delivery don land",
  carrying: "You dey do delivery",
  forYou: (v) => `${v.amount} for you`,
  collect: (v) => `Collect ${v.amount}`,
  parcels: (v) => (Number(v.count) === 1 ? "1 parcel" : `${v.count} parcels`),
  accept: "I go carry am",
  continueJob: "Continue this delivery",
  noJobs: "No delivery for now",
  noJobsOnline: "Your company go give you work here. Pull down make you check again.",
  noJobsOffline: "On am when you ready, make your company know say you fit carry work.",
  pickupT: "Go the shop",
  have: "I don collect the parcel",
  dropT: (v) => `Carry am go give ${v.name}`,
  with: "I don reach customer",
  codeT: (v) => `Ask ${v.name} for their delivery code`,
  codeHint: "The 4-digit code dey the customer phone.",
  next: "Next",
  cashT: (v) => `Collect ${v.amount}`,
  cashHint: "Count am before you comot. Pay am in with the rest of today cash before 6pm.",
  paidCash: "Cash",
  paidTransfer: "Dem send transfer",
  otherAmount: "Dem pay different amount",
  got: "I don collect am",
  delivered: "I don deliver am",
  doneT: "E don reach!",
  doneEarned: "We don add am to wetin you make.",
  doneCash: (v) => `${v.amount} cash dey your hand now. Pay am in before 6pm.`,
  findNext: "Find the next delivery",
  openMap: "Open map",
  call: "Call",
  whatsapp: "WhatsApp",
  callCompany: (v) => `Call ${v.name}`,
  back: "Go back",
  cantDeliver: "I no fit deliver am",
  whyNot: "Why you no fit deliver am?",
  reasons: ["Customer no pick call", "Customer no dey the address", "Customer no gree collect am", "Address no correct", "Customer no get money"],
  photo: "Snap picture (no be must)",
  photoDone: "Picture don enter",
  cameraOff: "Your camera dey off. Allow camera for Shopinbos for your phone settings.",
  typeAll4: "Type all the 4 digits of the delivery code.",
  typeAmount: "Type how much the customer pay.",
  tryAgain: "Try again",
  removeLink: "Comot my Riders link from this phone",
  removeTitle: "Comot your Riders link from this phone?",
  removeBody: "You go need the link from your company to open your deliveries again.",
  keep: "Leave am",
  remove: "Comot am",
  newLink: "Use new link",
  loading: "We dey load your deliveries…",
  customer: "the customer",
  locAskT: "Make we see where you dey?",
  locAsk: "Shopinbos dey use your location only when you dey online, so we fit give you work wey near you.",
  locYes: "Share my location",
  locNo: "No be now",
  locOn: "We dey see your location while you dey online.",
  locOff: "Location dey off. You go still get work, but your company no go know who near pass.",
  locSettings: "On am for settings",
};

export const STRINGS: Record<RiderLang, Strings> = { en, pcm };

const LANG_KEY = "shopinbos.rider.lang";

function savedLang(): RiderLang {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return RIDER_LANGS.some((lang) => lang.code === value) ? (value as RiderLang) : "en";
  } catch {
    return "en";
  }
}

export type RiderT = Strings;

/** The rider's language (kept on this phone) and its strings. */
export function useRiderStrings() {
  const [lang, setLangState] = useState<RiderLang>(savedLang);
  const setLang = useCallback((next: RiderLang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts until the app closes.
    }
  }, []);
  return { lang, setLang, t: STRINGS[lang] };
}
