import { z } from 'zod';

/**
 * Nigerian mobile numbers to E.164 (+234XXXXXXXXXX).
 * Accepts 0803 123 4567, 803 123 4567, 2348031234567, +234 803 123 4567.
 * Other countries can be passed in full E.164 form (+...).
 */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s()-]/g, '');
  if (!raw) return null;
  let digits: string;
  if (raw.startsWith('+')) {
    digits = raw.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    if (digits.startsWith('234')) return isNgNational(digits.slice(3)) ? `+${digits}` : null;
    return `+${digits}`;
  }
  if (!/^\d+$/.test(raw)) return null;
  if (raw.startsWith('234')) digits = raw.slice(3);
  else if (raw.startsWith('0')) digits = raw.slice(1);
  else digits = raw;
  return isNgNational(digits) ? `+234${digits}` : null;
}

/** NG mobile national significant numbers are 10 digits starting 7, 8 or 9. */
function isNgNational(nsn: string): boolean {
  return /^[789][01]\d{8}$/.test(nsn);
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const e164 = normalizePhone(v);
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, like 0803 123 4567' });
      return z.NEVER;
    }
    return e164;
  });

/** Show +2348031234567 as 0803 123 4567. */
export function formatPhoneNg(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** +2348031234567 → +234 ••• ••• 4567 (logs, AI prompts). */
export function maskPhone(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 4)} ••• ••• ${e164.slice(-4)}` : '••••';
}
