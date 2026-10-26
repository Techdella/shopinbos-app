// Prepaid wallet rules shared by the server and the wallet screens (web and mobile). Pure, unit-tested in
// tests/wallet-balance.test.mjs.

/** Paystack references: top-ups by card, transfers into a top-up account, withdrawals. */
export const WALLET_REFERENCE = { topUp: "wtop_", transferIn: "wtrf_", withdrawal: "wwd_" } as const;

export const BALANCE_LIMITS = { topUpMin: 500, topUpMax: 2_000_000, withdrawMin: 1_000, withdrawMax: 5_000_000 } as const;

/** What's wrong with an amount in naira, or null. Whole naira only. */
export function validAmountNaira(naira: number, min: number, max: number) {
  if (!Number.isFinite(naira) || naira <= 0) return "Enter an amount.";
  if (!Number.isInteger(naira)) return "Enter whole naira, without kobo.";
  if (naira < min) return `The smallest amount is ₦${min.toLocaleString("en-NG")}.`;
  if (naira > max) return `The largest amount is ₦${max.toLocaleString("en-NG")}.`;
  return null;
}

/** A Nigerian phone number in the +234 form Paystack takes, or null. */
export function paystackPhone(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

/** Whose name a wallet account number is in (src/lib/wallet/identity.server.ts). */
export type AccountIdentity =
  | { kind: "business"; name: string }
  | { kind: "person"; firstName: string; lastName: string }
  | { kind: "account"; firstName: string; lastName: string };

/** Paystack wants a first and last name: a business name is split so the two read back as the whole name. */
export function paystackNames(identity: AccountIdentity) {
  if (identity.kind !== "business") return { first_name: identity.firstName, last_name: identity.lastName };
  const [first, ...rest] = identity.name.split(" ");
  return { first_name: first, last_name: rest.join(" ") || first };
}
