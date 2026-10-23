// The season an email goes out in (Lagos dates): it picks the pattern strip under the header and a short greeting,
// so Shopinbos emails dress up for Sallah, Easter, Independence Day, Detty December and the rest. Pure, tested in
// tests/email-look.test.mjs. Eid dates move with the moon: the table holds the expected dates (±1 day) per year.

export type SeasonKey = "default" | "new-year" | "valentine" | "easter" | "sallah" | "school" | "independence" | "detty-december" | "christmas";

export interface Season {
  key: SeasonKey;
  /** Short line above the email's eyebrow ("Happy Sallah! 🌙"), or null on ordinary days. */
  greeting: string | null;
  /** The pattern strip image under the header: public/brand/email/strips/<strip>.png. */
  strip: string;
}

const SEASONS: Record<SeasonKey, Season> = {
  default: { key: "default", greeting: null, strip: "default" },
  "new-year": { key: "new-year", greeting: "Happy New Year! 🎉", strip: "new-year" },
  valentine: { key: "valentine", greeting: "Happy Val's week! ❤️", strip: "valentine" },
  easter: { key: "easter", greeting: "Happy Easter! 🐣", strip: "easter" },
  sallah: { key: "sallah", greeting: "Barka da Sallah! 🌙", strip: "sallah" },
  school: { key: "school", greeting: "Back-to-school season 🎒", strip: "school" },
  independence: { key: "independence", greeting: "Happy Independence Day 🇳🇬", strip: "independence" },
  "detty-december": { key: "detty-december", greeting: "Detty December is here ✨", strip: "detty-december" },
  christmas: { key: "christmas", greeting: "Merry Christmas! 🎄", strip: "christmas" },
};

/** Good Friday to Easter Monday. */
const EASTER: Record<number, string> = { 2026: "2026-04-03", 2027: "2027-03-26", 2028: "2028-04-14", 2029: "2029-03-30", 2030: "2030-04-19" };
/** Eid al-Fitr and Eid al-Adha (expected; Nigeria declares the exact day). */
const EID: Record<number, string[]> = {
  2026: ["2026-03-20", "2026-05-27"],
  2027: ["2027-03-10", "2027-05-16"],
  2028: ["2028-02-27", "2028-05-05"],
  2029: ["2029-02-14", "2029-04-24"],
  2030: ["2030-02-04", "2030-04-13"],
};

const DAY = 86_400_000;
const lagos = (now: Date) => new Date(now.getTime() + 60 * 60_000);
const at = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

export function seasonFor(now: Date): Season {
  const local = lagos(now);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  const today = Date.UTC(y, m - 1, d);
  const within = (start: number, days: number) => today >= start && today < start + days * DAY;

  for (const eid of EID[y] ?? []) if (within(at(eid) - 1 * DAY, 4)) return SEASONS.sallah;
  if (EASTER[y] && within(at(EASTER[y]), 4)) return SEASONS.easter;
  if (m === 1 && d <= 7) return SEASONS["new-year"];
  if (m === 2 && d >= 7 && d <= 14) return SEASONS.valentine;
  if (m === 9 && d <= 15) return SEASONS.school;
  if ((m === 9 && d >= 28) || (m === 10 && d === 1)) return SEASONS.independence;
  if (m === 12 && d >= 15 && d <= 26) return SEASONS.christmas;
  if (m === 12) return SEASONS["detty-december"];
  return SEASONS.default;
}

export const SEASON_KEYS = Object.keys(SEASONS) as SeasonKey[];
