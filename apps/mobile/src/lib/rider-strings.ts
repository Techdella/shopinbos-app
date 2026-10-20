import { useCallback, useMemo } from "react";
import type { Locale, TFunction } from "@shared/i18n";
import { tFor, type KeysOf } from "@shared/i18n/catalog";
import { useLocale, useSetLocale } from "./i18n";

// Every word the Riders app shows, read from the app-language catalog shared/i18n/messages/m_rider (English,
// Pidgin, Yorùbá, Hausa and Igbo; the non-English files are drafts for a native speaker to check). The language is
// the app language (apps/mobile/src/lib/i18n.tsx): choosing one on the Riders screen changes it for the whole app.
// Screens use `t.forYou({ amount })` etc. as before; the words themselves live in the catalog.

export const RIDER_LANGS = [
  { code: "en", label: "English" },
  { code: "pcm", label: "Pidgin" },
  { code: "yo", label: "Yorùbá" },
  { code: "ha", label: "Hausa" },
  { code: "ig", label: "Igbo" },
] as const satisfies readonly { code: Locale; label: string }[];

export type RiderLang = (typeof RIDER_LANGS)[number]["code"];

type Fill = Record<string, string | number>;
type RiderKey = KeysOf<["m_rider"]>;

const REASON_KEYS = ["reason.0", "reason.1", "reason.2", "reason.3", "reason.4"] as const;

/** The rider words in one language, shaped for the screen (lines with blanks are functions). */
function riderWords(t: TFunction<RiderKey>) {
  const line = (key: RiderKey) => (v: Fill) => t(key, v);
  return {
    appName: t("appName"),
    online: t("online"),
    offline: t("offline"),
    onlineHint: t("onlineHint"),
    offlineHint: t("offlineHint"),
    earnedToday: t("earnedToday"),
    cashWithYou: t("cashWithYou"),
    cashWithYouHint: t("cashWithYouHint"),
    newJob: t("newJob"),
    carrying: t("carrying"),
    forYou: line("forYou"),
    collect: line("collect"),
    parcels: line("parcels"),
    accept: t("accept"),
    continueJob: t("continueJob"),
    noJobs: t("noJobs"),
    noJobsOnline: t("noJobsOnline"),
    noJobsOffline: t("noJobsOffline"),
    pickupT: t("pickupT"),
    have: t("have"),
    dropT: line("dropT"),
    with: t("with"),
    codeT: line("codeT"),
    codeHint: t("codeHint"),
    codeProgress: line("codeProgress"),
    next: t("next"),
    cashT: line("cashT"),
    cashHint: t("cashHint"),
    paidCash: t("paidCash"),
    paidTransfer: t("paidTransfer"),
    otherAmount: t("otherAmount"),
    got: t("got"),
    delivered: t("delivered"),
    doneT: t("doneT"),
    doneEarned: t("doneEarned"),
    doneCash: line("doneCash"),
    findNext: t("findNext"),
    openMap: t("openMap"),
    call: t("call"),
    whatsapp: t("whatsapp"),
    callCompany: line("callCompany"),
    back: t("back"),
    cantDeliver: t("cantDeliver"),
    whyNot: t("whyNot"),
    reasons: REASON_KEYS.map((key) => t(key)),
    photo: t("photo"),
    photoDone: t("photoDone"),
    cameraOff: t("cameraOff"),
    typeAll4: t("typeAll4"),
    typeAmount: t("typeAmount"),
    tryAgain: t("tryAgain"),
    removeLink: t("removeLink"),
    removeTitle: t("removeTitle"),
    removeBody: t("removeBody"),
    keep: t("keep"),
    remove: t("remove"),
    newLink: t("newLink"),
    loading: t("loading"),
    customer: t("customer"),
    locAskT: t("locAskT"),
    locAsk: t("locAsk"),
    locYes: t("locYes"),
    locNo: t("locNo"),
    locOn: t("locOn"),
    locOff: t("locOff"),
    locSettings: t("locSettings"),
    language: t("language"),
  };
}

export type RiderT = ReturnType<typeof riderWords>;

/** The rider words in a given language (English for the reasons the company and the shop read). */
export function riderStringsFor(locale: Locale): RiderT {
  return riderWords(tFor(locale, "m_rider"));
}

/** Failure reasons go to the company and the shop in English, whatever language the rider uses. */
export const RIDER_REASONS_EN: readonly string[] = riderStringsFor("en").reasons;

/** "Need help?" reasons (m_rider help.0–3): shown in the rider's language, sent to the company in English. */
export const RIDER_HELP_KEYS = ["help.0", "help.1", "help.2", "help.3"] as const;
export const RIDER_HELP_EN: readonly string[] = RIDER_HELP_KEYS.map((key) => tFor("en", "m_rider")(key));

function isRiderLang(value: string): value is RiderLang {
  return RIDER_LANGS.some((lang) => lang.code === value);
}

/** The rider's language (the app language, kept on this phone) and its strings. */
export function useRiderStrings() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const lang: RiderLang = isRiderLang(locale) ? locale : "en";
  const setLang = useCallback((next: RiderLang) => void setLocale(next), [setLocale]);
  const t = useMemo(() => riderStringsFor(lang), [lang]);
  // Every other m_rider line, by key: say("take"), say("youEarn", { amount }).
  const say = useMemo(() => tFor(lang, "m_rider"), [lang]);
  return { lang, setLang, t, say };
}
