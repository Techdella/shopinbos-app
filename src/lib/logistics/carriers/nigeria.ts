// Nigerian address and phone details the carriers ask for. Pure, unit-tested (tests/carriers.test.mjs).

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi",
  "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

// Names people write instead of the state: its capital or a well-known area. Checked after the state names.
const ALIASES: Array<[RegExp, NigerianState]> = [
  [/\b(abuja|f\.?c\.?t|garki|wuse|maitama|asokoro|gwarinpa|kubwa|lugbe|jabi)\b/i, "FCT"],
  [/\b(ikeja|lekki|yaba|surulere|ikoyi|victoria island|v\.?i\.?|ajah|festac|ikorodu|epe|badagry|apapa|maryland|ogba|magodo|gbagada|oshodi|agege|ojota|ketu|mushin|isolo|ilupeju|ajegunle|sangotedo|chevron|idumota|obalende|alimosho|egbeda|ojo)\b/i, "Lagos"],
  [/\b(port harcourt|ph city|obio[- ]akpor)\b/i, "Rivers"],
  [/\b(ibadan|ogbomosho)\b/i, "Oyo"],
  [/\b(benin city)\b/i, "Edo"],
  [/\b(abeokuta|sagamu|ota|mowe|ibafo|ijebu)\b/i, "Ogun"],
  [/\b(uyo)\b/i, "Akwa Ibom"],
  [/\b(calabar)\b/i, "Cross River"],
  [/\b(owerri)\b/i, "Imo"],
  [/\b(awka|onitsha|nnewi)\b/i, "Anambra"],
  [/\b(asaba|warri)\b/i, "Delta"],
  [/\b(jos)\b/i, "Plateau"],
  [/\b(ilorin)\b/i, "Kwara"],
  [/\b(akure)\b/i, "Ondo"],
  [/\b(osogbo|ile[- ]ife)\b/i, "Osun"],
  [/\b(aba|umuahia)\b/i, "Abia"],
  [/\b(nsukka)\b/i, "Enugu"],
  [/\b(zaria)\b/i, "Kaduna"],
  [/\b(yenagoa)\b/i, "Bayelsa"],
  [/\b(makurdi)\b/i, "Benue"],
  [/\b(maiduguri)\b/i, "Borno"],
  [/\b(lokoja)\b/i, "Kogi"],
  [/\b(minna)\b/i, "Niger"],
  [/\b(lafia)\b/i, "Nasarawa"],
  [/\b(yola)\b/i, "Adamawa"],
  [/\b(abakaliki)\b/i, "Ebonyi"],
  [/\b(ado[- ]ekiti)\b/i, "Ekiti"],
];

/**
 * The state an address is in, from its words ("12 Allen Ave, Ikeja" → Lagos), else the fallback. The last state
 * named wins ("Lagos Street, Abuja" → FCT), since addresses end with the state.
 */
export function nigerianState(address: string | null | undefined, fallback: NigerianState = "Lagos"): NigerianState {
  const text = (address ?? "").replace(/\s+/g, " ");
  let best: { state: NigerianState; at: number } | null = null;
  for (const state of NIGERIAN_STATES) {
    const pattern = new RegExp(`\\b${state.replace(" ", "\\s+")}\\b(?!\\s+(street|st\\.?|road|rd\\.?|avenue|ave\\.?|close|crescent|way)\\b)`, "gi");
    for (const match of text.matchAll(pattern)) {
      if (!best || match.index! > best.at) best = { state, at: match.index! };
    }
  }
  if (best) return best.state;
  for (const [pattern, state] of ALIASES) if (pattern.test(text)) return state;
  return fallback;
}

/** "+2348031234567" (international) or "08031234567" (local) from however the number was typed. */
export function ngPhone(phone: string | null | undefined, format: "intl" | "local" = "intl", dialCode = "234") {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  let intl: string;
  if (raw.startsWith("+")) intl = digits;
  else if (digits.startsWith("00")) intl = digits.slice(2);
  else if (digits.startsWith(dialCode) && digits.length > 10) intl = digits;
  else if (digits.startsWith("0")) intl = `${dialCode}${digits.slice(1)}`;
  else intl = `${dialCode}${digits}`;
  if (format === "intl") return `+${intl}`;
  return intl.startsWith(dialCode) ? `0${intl.slice(dialCode.length)}` : `+${intl}`;
}

/** "2026-10-16" in Lagos for the given moment. */
export function lagosDate(date: Date) {
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

/** First and last name from one name field ("Ada Obi Eze" → Ada, Obi Eze). */
export function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "Customer", last: parts.slice(1).join(" ") || "-" };
}
