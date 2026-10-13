// What Home shows (section 8A of the build spec): today's sales, at most three "Do these next" items and one
// line about Peggy. Pure, so the root tests can check the limit.
import type { TFunction } from "@shared/i18n";

export const MAX_DO_NEXT = 3;

export interface DoNextItem {
  key: string;
  title: string;
  hint: string;
  /** A web-app path; openPath() opens the app's own screen when there is one. */
  href: string;
  icon: "chat" | "mail" | "truck" | "box" | "coin" | "sparkle";
  image?: string | null;
  /** Short word on the button, e.g. "Send". */
  action?: string;
}

interface Task {
  key: string;
  icon: "chat" | "mail" | "truck" | "box" | "coin";
  title: string;
  hint: string;
  href: string;
  image?: string | null;
  action?: { label: string; href: string };
}

interface SetupNext {
  key: string;
  title: string;
  hint: string;
}

/** Peggy's tasks first (orders to send, chats to answer, stock running out), then the next setup step. Never more than three. */
export function doNextItems(tasks: readonly Task[] | null | undefined, setupNext?: SetupNext | null): DoNextItem[] {
  const items: DoNextItem[] = (tasks ?? []).map((task) => ({
    key: task.key,
    title: task.title,
    hint: task.hint,
    href: task.action?.href ?? task.href,
    icon: task.icon,
    image: task.image ?? null,
    action: task.action?.label,
  }));
  if (setupNext && items.length < MAX_DO_NEXT) {
    items.push({ key: `setup:${setupNext.key}`, title: setupNext.title, hint: setupNext.hint, href: "/home/start", icon: "sparkle", action: "Start" });
  }
  return items.slice(0, MAX_DO_NEXT);
}

/** The one line about Peggy under "Do these next" (m_home "peggy.*" in the app language when `t` is given). */
export function peggyLine(counts: { chatsToday: number; ordersToday: number } | null | undefined, t?: Pick<TFunction, "dynamic">) {
  if (t) {
    if (!counts) return t.dynamic("peggy.watching", "Peggy is keeping an eye on your shop.");
    const vars = { chats: counts.chatsToday, orders: counts.ordersToday };
    if (counts.chatsToday && counts.ordersToday) return t.dynamic("peggy.chatsAndOrders", "", vars);
    if (counts.chatsToday) return t.dynamic("peggy.chats", "", vars);
    if (counts.ordersToday) return t.dynamic("peggy.orders", "", vars);
    return t.dynamic("peggy.askAnything", "Peggy is keeping an eye on your shop. Ask her anything.");
  }
  if (!counts) return "Peggy is keeping an eye on your shop.";
  const parts = [
    counts.chatsToday ? `${counts.chatsToday} chat${counts.chatsToday === 1 ? "" : "s"}` : null,
    counts.ordersToday ? `${counts.ordersToday} order${counts.ordersToday === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length ? `Peggy kept an eye on ${parts.join(" and ")} today.` : "Peggy is keeping an eye on your shop. Ask her anything.";
}
