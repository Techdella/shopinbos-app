// Email preference topics, pure (unit-tested). The server side lives in preferences.server.ts.
//
// Store contacts (B) keep their choices on Subscriber.metadata.emailTopics; a missing key means "on" (everyone on a
// list before this existed keeps getting what they got). Subscriber.status stays the master switch: "unsubscribed"
// means no marketing email at all.
// Shopinbos users (A) keep theirs as NotificationPreference rows (category "system", eventKey "email.<topic>",
// the email column); no row means "on". Security, billing and account notices aren't topics: they always send.

export const STORE_TOPICS = [
  { key: "promotions", label: "Promotions and newsletters", help: "Sales, new collections, discount codes and the shop's news." },
  { key: "product_updates", label: "Product updates and back in stock", help: "When something you liked is back, drops in price or is running low." },
  { key: "cart_reminders", label: "Cart reminders and recommendations", help: "A nudge about items left in your cart, and picks based on what you bought." },
] as const;
export type StoreTopic = (typeof STORE_TOPICS)[number]["key"];

export const PLATFORM_TOPICS = [
  { key: "product_news", label: "Product news and tips", help: "New Shopinbos features, guides and ideas to grow your business." },
  { key: "lifecycle", label: "Tips, milestones and reminders", help: "Reminders to finish setting up, ideas to try next, celebrating your milestones, and a nudge if you've been away." },
  { key: "weekly_summary", label: "Weekly summaries", help: "A short weekly recap of your sales, orders and what to do next." },
] as const;
export type PlatformTopic = (typeof PLATFORM_TOPICS)[number]["key"];

/** Always sent, can't be switched off (listed on the preference page so people know). */
export const PLATFORM_REQUIRED = ["Security and sign-in alerts", "Billing and payouts", "Account and order notices"] as const;

export const platformEventKey = (topic: PlatformTopic) => `email.${topic}`;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readContactTopics(metadata: unknown): Record<StoreTopic, boolean> {
  const saved = record(record(metadata).emailTopics);
  return Object.fromEntries(STORE_TOPICS.map((topic) => [topic.key, saved[topic.key] !== false])) as Record<StoreTopic, boolean>;
}

/** Whether a contact may get marketing email on this topic (null topic: only the master switch counts). */
export function contactAllows(row: { status: string; metadata: unknown } | null | undefined, topic: StoreTopic | null) {
  if (!row) return true; // not on the list: an order contact, never unsubscribed
  if (row.status !== "active") return false;
  return topic ? readContactTopics(row.metadata)[topic] : true;
}

/** Automation triggers whose emails are about an order (service messages: no address gate, transactional footer). */
export const ORDER_EMAIL_TRIGGERS = ["order_placed", "payment_received", "order_shipped", "order_delivered", "review_request"] as const;

export function isOrderEmailTrigger(trigger: string) {
  return (ORDER_EMAIL_TRIGGERS as readonly string[]).includes(trigger);
}

/** The preference topic an automation's emails fall under, or null for order (service) emails. */
export function topicForTrigger(trigger: string): StoreTopic | null {
  if (isOrderEmailTrigger(trigger)) return null;
  if (trigger === "abandoned_checkout" || trigger === "browse_abandonment") return "cart_reminders";
  if (trigger === "low_stock") return "product_updates";
  return "promotions";
}
