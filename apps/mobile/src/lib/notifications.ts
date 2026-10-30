import { router } from "expo-router";
import { appRouteFor, type NotifyCategory, type NotifyChannel } from "@shared/notifications";
import { sellsDigitalGoods } from "@shared/store-payments";
import { api } from "./api";
import { openPath } from "./web";

// The bell in the app: the same notifications as the web (GET /api/notifications), marking read, the push
// settings (/api/notifications/settings) and where a tap goes (shared/notifications.ts appRouteFor).

export interface AppNotification {
  id: string;
  category: NotifyCategory;
  priority: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  link: string | null;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
  /** The app screen it opens, when the sender named one (push centre campaigns), kept with the row. */
  metadata?: { appRoute?: string | null } | null;
}

export interface NotificationPage {
  items: AppNotification[];
  unreadCount: number;
  hasNextPage: boolean;
}

export async function fetchNotifications(tab = "all", page = 1): Promise<NotificationPage> {
  const data = await api<{ items: AppNotification[]; unreadCount: number; pagination: { hasNextPage: boolean } }>(`/api/notifications?tab=${encodeURIComponent(tab)}&page=${page}&limit=30`);
  // A bell item that sells AI credits, a plan or a top-up ("Running low? Top up credits") isn't shown in the app (app
  // store payment rules, shared/store-payments.ts); the website's bell still has it.
  return { items: data.items.filter((item) => !sellsDigitalGoods(item)), unreadCount: data.unreadCount, hasNextPage: data.pagination.hasNextPage };
}

export async function fetchUnreadCount(): Promise<number> {
  const data = await api<{ unreadCount: number }>("/api/notifications?tab=unread&limit=1");
  return data.unreadCount;
}

export async function markNotificationsRead(target: { id: string } | { all: true; tab?: string }): Promise<number | null> {
  const data = await api<{ unreadCount?: number }>("/api/notifications", { method: "PATCH", json: target }).catch(() => null);
  return typeof data?.unreadCount === "number" ? data.unreadCount : null;
}

export interface NotificationSettings {
  categories: { key: NotifyCategory; label: string; help: string; channels: Record<NotifyChannel, boolean>; textAllowed: boolean }[];
  quietHours: { enabled: boolean; start: string; end: string; timezone: string };
  available: { webPush: boolean; email: boolean; sms: boolean; whatsapp: boolean };
  devices: number;
}

export const fetchNotificationSettings = () => api<NotificationSettings>("/api/notifications/settings");

export const saveNotificationSettings = (body: { categories?: Partial<Record<NotifyCategory, Partial<Record<NotifyChannel, boolean>>>>; quietHours?: { enabled?: boolean; start?: string; end?: string } }) =>
  api<NotificationSettings>("/api/notifications/settings", { method: "PUT", json: body });

export const sendTestNotification = () => api<{ sent: boolean; devices: number }>("/api/notifications/test", { method: "POST", json: {} });

/** A push was tapped: counts as "opened" for Push center campaigns (/admin/push). Fire and forget. */
export function reportPushOpened(notificationId: string) {
  void api("/api/notifications/opened", { method: "POST", json: { notificationId } }).catch(() => null);
}

/** Opens what a notification is about: the app's own screen when there is one, else that page of the website. */
export function openNotificationTarget(target: { route?: string | null; url?: string | null }) {
  // app:/posts/<id> (the "Time to post" reminder) may come as the link or as the push's route.
  const own = target.route?.startsWith("app:") ? target.route : null;
  if (target.route && !own) return router.push(target.route as never);
  const route = appRouteFor(own ?? target.url);
  if (route) return router.push((route.params ? { pathname: route.pathname, params: route.params } : route.pathname) as never);
  // Anything else the app has its own screen for (payouts, campaigns, reviews…) opens there; only the rest goes to the web.
  const path = target.url?.replace(/^https?:\/\/[^/]+/i, "") ?? "";
  if (path.startsWith("/")) return void openPath(path);
  return router.push("/notifications");
}

// One unread number for the bell buttons and the app icon badge.
let unread = 0;
const listeners = new Set<(count: number) => void>();

export function setUnreadCount(count: number) {
  unread = Math.max(0, count);
  listeners.forEach((listener) => listener(unread));
}

export function getUnreadCount() {
  return unread;
}

export function onUnreadCount(listener: (count: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
