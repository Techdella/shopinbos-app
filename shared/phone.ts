// Phone helpers shared by web and mobile sign-in. Supabase phone auth expects E.164 (+2348031234567).

export interface DialCountry {
  code: string;
  dial: string;
  name: string;
  /** National significant number length, without the trunk 0. */
  digits: number;
  example: string;
}

export const DIAL_COUNTRIES: DialCountry[] = [
  { code: "NG", dial: "+234", name: "Nigeria", digits: 10, example: "803 412 7790" },
  { code: "GH", dial: "+233", name: "Ghana", digits: 9, example: "24 412 7790" },
  { code: "KE", dial: "+254", name: "Kenya", digits: 9, example: "712 345 678" },
  { code: "ZA", dial: "+27", name: "South Africa", digits: 9, example: "82 412 7790" },
];

export const DEFAULT_DIAL_COUNTRY = DIAL_COUNTRIES[0];

export function dialCountry(code: string | null | undefined): DialCountry {
  return DIAL_COUNTRIES.find((country) => country.code === code) ?? DEFAULT_DIAL_COUNTRY;
}

/**
 * Turns what a person types ("0803 412 7790", "803-412-7790", "+234 803 412 7790") into E.164.
 * Returns null when the number can't be valid for the chosen country.
 */
export function toE164(input: string, country: DialCountry = DEFAULT_DIAL_COUNTRY): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  const dialDigits = country.dial.slice(1);

  if (raw.startsWith("+")) {
    if (!digits.startsWith(dialDigits)) {
      // A full international number for another country: accept any plausible E.164 length.
      return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
    }
    digits = digits.slice(dialDigits.length);
  } else if (digits.startsWith(dialDigits) && digits.length === dialDigits.length + country.digits) {
    digits = digits.slice(dialDigits.length);
  }

  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== country.digits) return null;
  return `${country.dial}${digits}`;
}

/** "+2348034127790" → "+234 803 412 7790" for display. */
export function formatE164(e164: string): string {
  const country = DIAL_COUNTRIES.find((item) => e164.startsWith(item.dial));
  if (!country) return e164;
  const rest = e164.slice(country.dial.length);
  const groups = country.digits === 10 ? [3, 3, 4] : [2, 3, 4];
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= rest.length) break;
    parts.push(rest.slice(index, index + size));
    index += size;
  }
  if (index < rest.length) parts.push(rest.slice(index));
  return `${country.dial} ${parts.join(" ")}`;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 45;

/**
 * The sign-in code in pasted text: "123456", "123 456", "123-456" or the whole message ("Your Shopinbos code is
 * 123456. It expires in 10 minutes."). The digits typed so far when there's no full code in it.
 */
export function codeFromText(text: string): string {
  const whole = new RegExp(`(?<!\\d)\\d{${OTP_LENGTH}}(?!\\d)`).exec(text);
  if (whole) return whole[0];
  const grouped = new RegExp(`(?<![\\d])\\d(?:[\\s-]?\\d){${OTP_LENGTH - 1}}(?![\\d])`).exec(text);
  if (grouped) return grouped[0].replace(/\D/g, "");
  return text.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/** +2348031234567 → Nigeria and "8031234567", to fill the phone field again. Null for a number from elsewhere. */
export function splitE164(e164: string): { country: DialCountry; national: string } | null {
  const country = DIAL_COUNTRIES.find((item) => e164.startsWith(item.dial));
  return country ? { country, national: e164.slice(country.dial.length).replace(/\D/g, "") } : null;
}

/**
 * The key two phone numbers are compared by: the last 10 digits ("+234 803 123 4567", "08031234567" and
 * "2348031234567" are the same number). Null when there aren't 10 digits. One account per number uses it.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}
