// Shopinbos accounts are for adults: sellers, suppliers and delivery partners must be 18 or older (NDPA 2023 s.31:
// processing a child's data needs a parent's or guardian's consent, which Shopinbos doesn't collect; contracts with
// a minor are also voidable). Sign-up asks "I'm 18 or older" (recorded as preferences.ageConfirmedAt), and the ID
// check confirms it from the date of birth on the NIN or BVN. Pure, tested in tests/privacy-gaps.test.mjs.

export const MINIMUM_AGE = 18;

/** Whole years between a YYYY-MM-DD birthday and `now`, or null for a date that isn't one. */
export function ageOn(dateOfBirth: string | null | undefined, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function isAdult(dateOfBirth: string | null | undefined, now = new Date()) {
  const age = ageOn(dateOfBirth, now);
  return age !== null && age >= MINIMUM_AGE;
}
