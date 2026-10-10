import "server-only";
import { db } from "@/lib/db/client";
import { sendEmail } from "./resend";

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
  sendEmail?: boolean;
}

export async function createNotification(input: CreateNotificationInput): Promise<any>;
export async function createNotification(
  userId: string,
  type: CreateNotificationInput["type"],
  priority: CreateNotificationInput["priority"],
  title: string,
  description: string,
  options?: { link?: string; actionLabel?: string; actionUrl?: string; metadata?: Record<string, unknown> },
): Promise<any>;

export async function createNotification(
  userIdOrInput: string | CreateNotificationInput,
  type?: CreateNotificationInput["type"],
  priority?: CreateNotificationInput["priority"],
  title?: string,
  description?: string,
  options?: { link?: string; actionLabel?: string; actionUrl?: string; metadata?: Record<string, unknown> },
) {
  let input: CreateNotificationInput;

  if (typeof userIdOrInput === "string") {
    input = {
      userId: userIdOrInput,
      type: type!,
      priority: priority ?? "info",
      title: title!,
      description: description!,
      link: options?.link,
      actionLabel: options?.actionLabel,
      actionUrl: options?.actionUrl,
      metadata: options?.metadata,
    };
  } else {
    input = { ...userIdOrInput, priority: userIdOrInput.priority ?? "info" };
  }

  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      priority: input.priority,
      title: input.title,
      description: input.description,
      link: input.link,
      actionLabel: input.actionLabel,
      actionUrl: input.actionUrl,
      metadata: input.metadata ?? {},
    },
  });

  if (input.sendEmail) {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });

    if (user?.email) {
      await sendEmail({
        to: [user.email],
        subject: input.title,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <p style="color:#333;line-height:1.6;font-size:15px">${input.description}</p>
          ${input.link ? `<a href="${input.link}" style="display:inline-block;padding:10px 20px;background:#195754;color:white;text-decoration:none;border-radius:8px;margin:12px 0;font-size:14px">View details</a>` : ""}
        </div>`,
      }).catch(() => {});
    }
  }

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
