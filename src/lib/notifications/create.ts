import "server-only";
import { notify, type NotifyInput } from "./notify.server";

// createNotification is the older name for notify() (./notify.server.ts): it writes the bell notification and then
// sends push / email / SMS / WhatsApp the way the person chose. Pass `event` (shared/notifications.ts) so it lands
// in the right category, and `dedupeKey` when the same thing could be triggered twice.

export interface CreateNotificationInput {
  userId: string;
  type: "order" | "payout" | "peggy" | "marketplace" | "system" | "inventory" | "logistics" | "products" | "customers" | "suppliers" | "store_builder" | "marketing" | "rexai" | "checkout" | "category" | "health" | "activity" | "dropshipping";
  priority?: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  link?: string;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  /** Email it too (follows the person's email switch; payouts and critical alerts always send). */
  sendEmail?: boolean;
  event?: NotifyInput["event"];
  dedupeKey?: NotifyInput["dedupeKey"];
  urgent?: boolean;
  /** The caller already texted them about this. */
  phoneHandled?: boolean;
  /** New messages: who wrote (a delivery partner can turn push off per source). */
  messageSource?: NotifyInput["messageSource"];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createNotification(input: CreateNotificationInput): Promise<any>;
export async function createNotification(
  userId: string,
  type: CreateNotificationInput["type"],
  priority: CreateNotificationInput["priority"],
  title: string,
  description: string,
  options?: { link?: string; actionLabel?: string; actionUrl?: string; metadata?: Record<string, unknown>; event?: string; dedupeKey?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any>;

export async function createNotification(
  userIdOrInput: string | CreateNotificationInput,
  type?: CreateNotificationInput["type"],
  priority?: CreateNotificationInput["priority"],
  title?: string,
  description?: string,
  options?: { link?: string; actionLabel?: string; actionUrl?: string; metadata?: Record<string, unknown>; event?: string; dedupeKey?: string },
) {
  const input: CreateNotificationInput =
    typeof userIdOrInput === "string"
      ? {
          userId: userIdOrInput,
          type: type!,
          priority: priority ?? "info",
          title: title!,
          description: description!,
          link: options?.link,
          actionLabel: options?.actionLabel,
          actionUrl: options?.actionUrl,
          metadata: options?.metadata,
          event: options?.event,
          dedupeKey: options?.dedupeKey,
        }
      : userIdOrInput;

  const { notification } = await notify({
    userId: input.userId,
    type: input.type,
    event: input.event,
    priority: input.priority ?? "info",
    title: input.title,
    description: input.description,
    link: input.link,
    actionLabel: input.actionLabel,
    actionUrl: input.actionUrl,
    metadata: input.metadata,
    email: input.sendEmail ? true : false,
    dedupeKey: input.dedupeKey,
    urgent: input.urgent,
    phoneHandled: input.phoneHandled,
    messageSource: input.messageSource,
  });
  return notification;
}

export async function createOrderNotification(
  userId: string,
  orderNumber: string,
) {
  return createNotification({
    userId,
    type: "order",
    title: "New order received",
    description: `Order ${orderNumber} has been placed and is awaiting confirmation.`,
    link: "/home/orders",
    sendEmail: true,
    event: "order.new",
    dedupeKey: `order.new:${orderNumber}`,
  });
}

export async function createPayoutNotification(
  userId: string,
  amount: string,
  status: "paid" | "pending" | "failed",
) {
  const messages: Record<string, { title: string; description: string }> = {
    paid: { title: "Payout completed", description: `Your payout of ${amount} has been sent to your bank account.` },
    pending: { title: "Payout processing", description: `Your payout of ${amount} is being processed and will arrive in 1-2 business days.` },
    failed: { title: "Payout failed", description: `Your payout of ${amount} could not be processed. Please update your bank details.` },
  };

  const msg = messages[status];
  return createNotification({
    userId,
    type: "payout",
    title: msg.title,
    description: msg.description,
    link: "/home/payments",
    sendEmail: true,
    event: status === "failed" ? "payout.failed" : "payout.sent",
  });
}

export async function createPeggyNotification(
  userId: string,
  description: string,
  link?: string,
) {
  return createNotification({
    userId,
    type: "peggy",
    title: "Peggy insight",
    description,
    link,
    event: "tip",
  });
}

export async function createMarketplaceNotification(
  userId: string,
  description: string,
  link?: string,
) {
  return createNotification({
    userId,
    type: "marketplace",
    title: "Marketplace update",
    description,
    link,
  });
}

export async function createSystemNotification(
  userId: string,
  title: string,
  description: string,
) {
  return createNotification({
    userId,
    type: "system",
    title,
    description,
  });
}
