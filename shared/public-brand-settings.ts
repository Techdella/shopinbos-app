// Store.brandSettings mixes the storefront's look with the owner's private data (payout bank, billing,
// onboarding notes, invites, Peggy's settings). Anything sent to shoppers goes through this first.

const PRIVATE_KEYS = ["payoutBank", "launchBilling", "onboardingMemory", "pendingInvites", "peggyPreferences", "rexVersions", "rexPreferences", "sourcing"] as const;

export function publicBrandSettings<T>(brandSettings: T): T {
  if (!brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) return brandSettings;
  const copy = { ...(brandSettings as Record<string, unknown>) };
  for (const key of PRIVATE_KEYS) delete copy[key];
  // Legal pages are public, but drafts aren't, and the text itself is loaded by the policy page: shoppers
  // get only the published pages' titles (for footer and checkout links).
  const legalPages = copy.legalPages;
  if (legalPages && typeof legalPages === "object" && !Array.isArray(legalPages)) {
    copy.legalPages = Object.fromEntries(
      Object.entries(legalPages as Record<string, unknown>)
        .filter(([, page]) => Boolean(page) && typeof page === "object" && (page as Record<string, unknown>).published === true)
        .map(([key, page]) => [key, { title: String((page as Record<string, unknown>).title ?? "").slice(0, 120), published: true }]),
    );
  }
  return copy as T;
}
