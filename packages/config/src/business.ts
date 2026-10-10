/**
 * Business numbers for Shopinbos. The only place fees, limits and rates may live.
 *
 * Rules (SPEC section 0 and 7):
 * - Money is integer kobo (₦1 = 100 kobo). Percentages are basis points (1% = 100 bps).
 * - A number the owner has not confirmed is marked `[PLACEHOLDER]` or `[PRICE]`.
 *   Do not invent values: if the spec gives no default, `value` is `null`.
 * - Changing any confirmed money rule needs the owner's sign-off.
 */

export type ConfigStatus = 'CONFIRMED' | '[PLACEHOLDER]' | '[PRICE]';

export interface ConfigValue<T> {
  value: T;
  status: ConfigStatus;
  note?: string;
}

const confirmed = <T>(value: T, note?: string): ConfigValue<T> => ({
  value,
  status: 'CONFIRMED',
  ...(note ? { note } : {}),
});
const placeholder = <T>(value: T, note?: string): ConfigValue<T> => ({
  value,
  status: '[PLACEHOLDER]',
  ...(note ? { note } : {}),
});
const price = (note?: string): ConfigValue<number | null> => ({
  value: null,
  status: '[PRICE]',
  ...(note ? { note } : {}),
});

/** ₦ → kobo, for writing config literals only. Never use with runtime floats. */
const naira = (n: number): number => n * 100;

export const KOBO_PER_NAIRA = 100;
export const DEFAULT_CURRENCY = 'NGN';
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

export const business = {
  cod: {
    /** Max order total for pay on delivery (SPEC 1, 6.2, 7.4). */
    maxKobo: confirmed(naira(50_000)),
    /** Refused COD orders within the window that block COD for a phone (SPEC 7.4). */
    refusalBlockCount: confirmed(2),
    refusalWindowDays: confirmed(90),
    /** Partners pay in collected cash by this local time, same day (SPEC 6.9, 7.4). */
    remittanceDueLocalTime: confirmed('18:00'),
    deliveryCodeDigits: confirmed(4),
  },

  dropship: {
    /** Supplier must accept within this window, then the order is rerouted (SPEC 7.2). */
    acceptWindowMinutes: placeholder(4 * 60, 'Spec: [PLACEHOLDER: 4 hours]'),
    maxReroutes: confirmed(2),
    /** Return window after delivery before the split settles (SPEC 1, 7.2). */
    returnWindowHours: confirmed(48),
    platformCommissionBps: placeholder<number | null>(null, 'Open question 3'),
  },

  ownStock: {
    /** Hold on seller money after delivery for prepaid own-stock orders. 0 = no hold (SPEC 7.3). */
    holdHoursAfterDelivery: confirmed(0),
  },

  wholesale: {
    /** Escrow auto-release after "delivered" with no dispute (SPEC 7.5). */
    autoReleaseHours: confirmed(72),
  },

  imports: {
    chinaDeliveryKobo: placeholder(naira(8_600), 'Spec: [PLACEHOLDER: ₦8,600 flat]'),
    partnerFeeBps: placeholder(500, 'Sourcing partner fee 5% (SPEC 7.6)'),
    airFreightKoboPerKg: placeholder(naira(14_500), 'Spec: [PLACEHOLDER: 14,500]/kg'),
    seaFreightKoboPerCbm: placeholder(naira(780_000), 'Spec: [PLACEHOLDER: 780,000]/cbm'),
    seaMinCbm: confirmed(0.03),
    quoteLockHours: confirmed(24),
    fxRateSource: placeholder<string | null>(null, "Partner's quoted rate (open question 4)"),
  },

  paymentFees: {
    /**
     * Paystack local card estimate: min(round(T × 1.5%) + ₦100, ₦2,000); ₦100 waived under ₦2,500.
     * Use the fee from the Paystack event when present; this is for estimates only (SPEC 7.2).
     */
    paystackLocal: confirmed({
      percentBps: 150,
      flatKobo: naira(100),
      flatWaivedBelowKobo: naira(2_500),
      capKobo: naira(2_000),
    }),
  },

  fees: {
    sellerSubscriptionStarterMonthlyKobo: price('Seller subscription, Starter plan (SPEC 7.6)'),
    platformCommissionStoreOrdersBps: placeholder(0, 'Spec says 0 bps (confirm)'),
    deliveryPartnerCommissionBps: placeholder(1_500, '15% placeholder (open question 3)'),
    affiliateDefaultCommissionBps: confirmed(1_000),
    aiVideoCreditKobo: price('AI video credit price'),
    whatsappBroadcastMarginBps: placeholder<number | null>(
      null,
      "Pass-through of Meta's per-message rate plus a margin",
    ),
  },

  affiliates: {
    defaultCookieDays: placeholder<number | null>(null, 'Not in spec'),
  },

  peggy: {
    /** Peggy may never offer a discount above this (SPEC 6.11, 7.7). */
    maxDiscountBps: confirmed(1_000),
  },

  payouts: {
    /** Automatic payouts run on Fridays (SPEC 6.7). 0 = Sunday … 5 = Friday. */
    autoPayoutWeekday: confirmed(5),
  },

  storeHealth: {
    base: confirmed(50),
    max: confirmed(100),
    points: confirmed({
      payoutBank: 10,
      tenLiveProducts: 10,
      ownDomain: 8,
      aboutPage: 8,
      reviewsOnHome: 12,
      seasonalCampaign: 8,
      sizeChartOnClothing: 4,
      whatsappConnected: 5,
      marketingPostThisWeek: 5,
    }),
  },

  auth: {
    /** OTP starts per phone per minute (SPEC 8.1). */
    otpStartsPerMinute: confirmed(5),
    /** Lock after this many wrong codes, for lockMinutes (SPEC 14). */
    otpMaxFailedAttempts: confirmed(5),
    otpLockMinutes: confirmed(15),
  },

  rateLimits: {
    aiPerMinutePerStore: confirmed(30),
    publicApiPerMinutePerKey: confirmed(120),
  },
} as const;

/** Subdomains that can never be a store slug (SPEC 2.2). */
export const RESERVED_SUBDOMAINS = [
  'app',
  'api',
  'www',
  'admin',
  'partners',
  'suppliers',
  'riders',
  'help',
  'status',
  'mail',
  'cdn',
  'stores',
] as const;

export type Business = typeof business;
