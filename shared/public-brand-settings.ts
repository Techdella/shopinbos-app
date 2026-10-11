// Store.brandSettings mixes the storefront's look with the owner's private data (payout bank, billing,
// onboarding notes, invites, Peggy's settings). Anything sent to shoppers goes through this first.

const PRIVATE_KEYS = ["payoutBank", "launchBilling", "onboardingMemory", "pendingInvites", "peggyPreferences", "rexVersions"] as const;

export function publicBrandSettings<T>(brandSettings: T): T {
  if (!brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) return brandSettings;
  const copy = { ...(brandSettings as Record<string, unknown>) };
  for (const key of PRIVATE_KEYS) delete copy[key];
  return copy as T;
}
