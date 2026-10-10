/**
 * Local feature flags. PostHog flags override these at runtime once wired (phase 3+).
 * Keep defaults safe: anything that touches money or external channels starts off.
 */
export const featureFlags = {
  tiktokShop: false,
  domainPurchase: false,
  bluetoothPrinting: false,
  peggyAutoReply: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;
