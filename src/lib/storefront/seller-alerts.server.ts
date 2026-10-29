import "server-only";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { VISITOR_ALERT_WINDOW_MS, visitorAlertKey, visitorAlertText } from "./seller-alerts";

// "Someone is on your store": called by the visit beacon (POST /api/public/store/[slug]/visit, once per shopper's
// browser session). One alert per store every 15 minutes, saying how many came in that time; push and the bell only
// (never email or WhatsApp: that's for live chats). Sellers turn it off with "Live chat and visitors" in
// Settings › Notifications.

export async function alertStoreVisit(input: { storeId: string; source?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const store = await db.store.findUnique({ where: { id: input.storeId }, select: { userId: true, name: true } });
  if (!store) return;
  const key = visitorAlertKey(input.storeId, now);
  // Cheap check first: most visits land in a window that already has its alert.
  const sent = await db.notification.findFirst({ where: { userId: store.userId, dedupeKey: key }, select: { id: true } }).catch(() => null);
  if (sent) return;

  const [count, chat] = await Promise.all([
    db.storeVisitor.count({ where: { storeId: input.storeId, lastSeenAt: { gte: new Date(now.getTime() - VISITOR_ALERT_WINDOW_MS) } } }).catch(() => 1),
    db.liveChatConfig.findUnique({ where: { storeId: input.storeId }, select: { mode: true } }).catch(() => null),
  ]);
  const text = visitorAlertText({ count, source: input.source, storeName: store.name, chatOn: Boolean(chat) });
  await notify({
    userId: store.userId,
    event: "store.visitor",
    type: "activity",
    title: text.title,
    description: text.description,
    link: chat ? "/home/analytics/traffic" : "/home/marketing/chat",
    actionLabel: chat ? "See your visitors" : "Turn on live chat",
    metadata: { source: "storefront", storeId: input.storeId, visitors: count },
    dedupeKey: key,
    // Push and the bell only: no email, and phoneHandled keeps it off SMS and WhatsApp.
    phoneHandled: true,
  });
}
