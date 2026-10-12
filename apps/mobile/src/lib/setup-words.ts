// Start here steps come from the server (src/lib/setup on the web). On mobile some get plainer words (build spec 8A
// word list): no "domain", "theme" or "payout". Pure, so the root tests can check it.

interface StepLike {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  action: { label: string };
}

/** Mobile words for the server's steps (build spec 8A word list), and where the technical ones go on a phone. */
const MOBILE_STEP: Record<string, { title: string; hint?: string; label: string }> = {
  look: { title: "Choose how your shop looks", hint: "Pick a look, or let Rex make one from what you sell.", label: "Pick a look" },
  payout: { title: "Add your bank", hint: "We send your money there. Until then, it's safe here.", label: "Add bank" },
  domain: { title: "Get your own web address", hint: "A name like yourshop.com. We set it up for you.", label: "Ask us" },
  audience: { title: "Get your first customers", hint: "Share a discount code or send your customers a message.", label: "Start" },
};

export function stepWords(step: StepLike) {
  const mobile = MOBILE_STEP[step.key];
  return { title: mobile?.title ?? step.title, hint: step.done ? step.hint.replace(/\bdomain\b/gi, "web address").replace(/\bpayouts?\b/gi, "money") : mobile?.hint ?? step.hint, label: mobile?.label ?? step.action.label };
}

