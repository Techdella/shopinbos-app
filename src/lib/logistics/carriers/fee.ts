// The Shopinbos fee on a delivery booked on Shopinbos's network account. The network's own price is never changed:
// the fee is a separate line on top. Bookings on a seller's own network account carry no fee. Pure, unit-tested
// (tests/networks.test.mjs).
//
// Default: 3% of the network's price, at least ₦100 and at most ₦500. DELIVERY_NETWORK_FEE_PERCENT, _MIN and _MAX
// change it.

export interface NetworkFeeRule {
  percent: number;
  min: number;
  max: number;
}

export const DEFAULT_NETWORK_FEE: NetworkFeeRule = { percent: 3, min: 100, max: 500 };

export function networkFeeRule(env: Record<string, string | undefined> = process.env): NetworkFeeRule {
  const num = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const percent = num(env.DELIVERY_NETWORK_FEE_PERCENT, DEFAULT_NETWORK_FEE.percent);
  const min = num(env.DELIVERY_NETWORK_FEE_MIN, DEFAULT_NETWORK_FEE.min);
  const max = num(env.DELIVERY_NETWORK_FEE_MAX, DEFAULT_NETWORK_FEE.max);
  return { percent, min, max: Math.max(min, max) };
}

/** The fee in whole naira for a network price (₦0 for a free delivery). */
export function networkFee(price: number, rule: NetworkFeeRule = networkFeeRule()) {
  if (!(price > 0)) return 0;
  const raw = Math.round((price * rule.percent) / 100);
  return Math.min(rule.max, Math.max(rule.min, raw));
}

/** Network price, Shopinbos fee and what the seller pays, in naira (kobo-safe). */
export function networkTotal(price: number, rule: NetworkFeeRule = networkFeeRule()) {
  const fee = networkFee(price, rule);
  return { price, fee, total: Math.round((price + fee) * 100) / 100 };
}
