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
