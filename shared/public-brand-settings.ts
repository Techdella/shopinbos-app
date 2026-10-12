// Store.brandSettings mixes the storefront's look with the owner's private data (payout bank, billing,
// onboarding notes, invites, Peggy's settings). Anything sent to shoppers goes through this first.

// setup: onboarding progress and choices; notifications: SMS/voice provider settings; connectedChannels and
// chipTone: the owner's workspace preferences. None of it is needed to draw the storefront.
const PRIVATE_KEYS = ["payoutBank", "launchBilling", "onboardingMemory", "pendingInvites", "peggyPreferences", "rexVersions", "rexPreferences", "sourcing", "setup", "notifications", "connectedChannels", "chipTone", "domainOrders"] as const;

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
  // Unpublished edits stay private once a published version exists (a never-published store still renders
  // from its draft, see StorefrontClient).
  const editor = copy.editor;
  if (editor && typeof editor === "object" && !Array.isArray(editor) && (editor as Record<string, unknown>).published) {
    const { draft: _draft, ...rest } = editor as Record<string, unknown>;
    copy.editor = rest;
  }
  return copy as T;
}
