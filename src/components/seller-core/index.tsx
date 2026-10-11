import type { ComponentProps } from "react";
import type { AppFrame } from "@/components/shell/AppFrame";
import { cx } from "@/components/app-ui/cx";

// Small helpers shared by the seller core pages (orders, products, customers, reviews, inventory,
// categories, collections, dropship, messages). Server-safe: no server-only imports, so client
// components can use the class strings too.

type FrameProps = Omit<ComponentProps<typeof AppFrame>, "children">;

/** AppFrame props for a seller page from the signed-in user and their store row. */
export function sellerFrame(
  user: { name?: string | null; avatarUrl?: string | null; email?: string | null },
  store: { name: string; slug: string; logoUrl?: string | null } | null | undefined,
): FrameProps {
  return {
    role: "seller",
    storeName: store?.name,
    storeSlug: store?.slug,
    storeInitial: store?.name.charAt(0).toUpperCase(),
    storeLogoUrl: store?.logoUrl ?? null,
    userName: user.name ?? "You",
    avatarUrl: user.avatarUrl,
    userEmail: user.email,
  };
}

/** "Just now", "12 min ago", "3 hr ago", "Yesterday", "4 days ago", then a short date. */
export function timeAgo(date: Date | string, now = Date.now()) {
  const then = new Date(date).getTime();
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: days > 330 ? "numeric" : undefined });
}

const AVATAR_TINTS = ["bg-app-peach text-app-accent-ink", "bg-app-mint text-app-forest", "bg-app-lilac text-app-ink", "bg-app-success-tint text-app-success", "bg-[#E8EAFB] text-[#3D4FB8]"];

/** Round initials avatar, tinted from the name so the same person keeps the same colour. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "·";
  const tint = AVATAR_TINTS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full font-extrabold", tint)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials}
    </span>
  );
}

/** Form field styles in the app look (inputs are 48px tall, 16px text so phones don't zoom). */
export const field = {
  label: "mb-1.5 block text-[14px] font-bold text-app-ink",
  hint: "mt-1 text-[12.5px] text-app-ink-soft",
  input: "h-12 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-4 text-[16px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]",
  select: "h-12 w-full min-w-0 cursor-pointer rounded-[14px] border border-app-line bg-white px-3.5 text-[16px] text-app-ink outline-none transition focus:border-app-ink sm:text-[15px]",
  textarea: "w-full min-w-0 rounded-[14px] border border-app-line bg-white px-4 py-3 text-[16px] leading-[1.5] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]",
  checkbox: "h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#16141F]",
};

/** Small pill button styles for row actions inside forms (server actions can't use PillButton's onClick). */
export const pillButton = {
  ink: "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55",
  accent: "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full bg-app-accent px-4 text-[13px] font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55",
  white: "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink transition hover:border-app-line-strong disabled:cursor-not-allowed disabled:opacity-55",
  danger: "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-danger transition hover:border-app-danger disabled:cursor-not-allowed disabled:opacity-55",
};
