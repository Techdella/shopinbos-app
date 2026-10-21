"use client";

import { CreditsBadge } from "@/components/credits/CreditsBadge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/app-ui";
import { navLinks, type Role } from "@/lib/nav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SearchModal } from "./SearchModal";
import { ConversationsModal } from "./ConversationsModal";
import { useUnreadMessages } from "@/components/conversations/client";
import { SignOutButton } from "./SignOutButton";
import { TOGGLE_NAV_EVENT, useIdentity, useShellCounts } from "./useShellCounts";
import { initialsOf } from "@shared/identity-images";
import { navLabel } from "@shared/i18n/nav";
import { useT } from "@/components/i18n/I18nProvider";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";

// Top bar in the 2026 design: page title, pill search ("/" to focus), Ask Peggy, notifications, account menu.

interface GlobalTopBarProps {
  userName?: string;
  userInitials?: string;
  avatarUrl?: string | null;
  email?: string | null;
  role?: Role;
  searchPlaceholder?: string;
}

const PROFILE_HREF: Record<Role, string> = { seller: "/home/profile", supplier: "/supplier/profile", logistics_partner: "/logistics/profile", admin: "/admin/settings" };
const SETTINGS_HREF: Record<Role, string> = { seller: "/home/settings", supplier: "/supplier/settings", logistics_partner: "/logistics/settings", admin: "/admin/settings" };

function usePageTitle(role: Role) {
  const pathname = usePathname();
  const t = useT("nav");
  return useMemo(() => {
    let best: { id: string; label: string; length: number } | null = null;
    for (const link of navLinks(role)) {
      const matches = pathname === link.href || pathname.startsWith(`${link.href}/`);
      if (matches && (!best || link.href.length > best.length)) best = { id: link.id, label: link.label, length: link.href.length };
    }
    return best ? navLabel(t, role, best) : "";
  }, [pathname, role, t]);
}

export function GlobalTopBar({
  userName = "You",
  userInitials,
  avatarUrl,
  email,
  role = "seller",
  searchPlaceholder,
}: GlobalTopBarProps) {
  const t = useT("nav");
  const placeholder = searchPlaceholder ?? (role === "seller" ? t("shell.searchSeller") : t("shell.search"));
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const counts = useShellCounts();
  const title = usePageTitle(role);
  // Photo and name follow uploads and profile edits made anywhere in the app (see useIdentity).
  const me = useIdentity({ name: userName === "You" ? undefined : userName, avatarUrl });
  const displayName = me.name || userName;
  const initials = me.name ? initialsOf(me.name) : userInitials ?? initialsOf(userName);
  const unread = counts?.notifications ?? 0;
  // Unread partner messages, polled while the app is open and refreshed when a chat is read.
  const messagesUnread = useUnreadMessages();
  const openChat = useCallback(() => setChatOpen(true), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!typing && (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"))) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3.5 border-b border-app-line bg-white/[0.92] px-4 font-app text-app-ink backdrop-blur sm:px-7">
        <button type="button" aria-label={t("shell.openMenu")} onClick={() => window.dispatchEvent(new Event(TOGGLE_NAV_EVENT))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
          <Icon name="list" size={19} />
        </button>
        {title && <b className="whitespace-nowrap text-[15px] font-extrabold">{title}</b>}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            data-tour="search"
            onClick={() => setSearchOpen(true)}
            className="hidden h-[42px] w-full max-w-[460px] items-center gap-2.5 rounded-full bg-app-canvas px-4 text-left text-[14px] text-app-ink-soft md:flex"
          >
            <Icon name="search" size={16} />
            <span className="flex-1 truncate">{placeholder}</span>
            <kbd className="grid h-6 w-6 place-items-center rounded-full bg-white font-sans text-[12px] font-bold text-app-ink">/</kbd>
          </button>
        </div>
        <button type="button" aria-label={t("shell.search")} onClick={() => setSearchOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-app-line md:hidden">
          <Icon name="search" size={17} />
        </button>
        {(role === "seller" || role === "supplier") && <CreditsBadge manageHref={role === "supplier" ? "/supplier/credits" : "/home/credits"} />}
        {role === "seller" && (
          <Link href="/studio" className="hidden h-[42px] items-center gap-2 rounded-full border border-app-line bg-white pl-1.5 pr-4 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong lg:flex">
            <Mascot name="rex" className="h-8 w-8" alt="" /> {t("shell.askRex")}
          </Link>
        )}
        {role === "seller" && (
          <Link href="/peggy" data-tour="ask-peggy" className="hidden h-[42px] items-center gap-2 rounded-full border border-app-line bg-white pl-1.5 pr-4 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong sm:flex">
            <Mascot name="peggy" className="h-8 w-8" alt="" /> {t("shell.askPeggy")}
          </Link>
        )}
        {role !== "admin" && (
          <button type="button" aria-label={messagesUnread ? t("shell.messagesUnread", { count: messagesUnread }) : t("shell.messages")} onClick={openChat} className="relative grid h-[42px] w-[42px] place-items-center rounded-full border border-app-line hover:border-app-line-strong">
            <Icon name="chat" size={17} />
            {messagesUnread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-app-accent px-1 text-[10.5px] font-extrabold leading-none text-white ring-2 ring-white">
                {messagesUnread > 99 ? "99+" : messagesUnread}
              </span>
            )}
          </button>
        )}
        <NotificationBell role={role} initialUnread={unread} />
        <div className="relative" ref={menuRef}>
          <button type="button" aria-label={t("shell.account")} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="grid h-[42px] w-[42px] place-items-center overflow-hidden rounded-full bg-app-peach text-[13px] font-extrabold text-app-accent-ink">
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-88px)] min-w-[220px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[18px] border border-app-line bg-white p-1.5 shadow-[0_20px_40px_-20px_rgba(22,20,31,0.35)]">
              <div className="px-3 py-2">
                <div className="truncate text-[14px] font-extrabold">{displayName}</div>
                {email && <div className="truncate text-[12px] text-app-ink-soft">{email}</div>}
              </div>
              <Link href={PROFILE_HREF[role]} onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] font-semibold text-app-ink no-underline hover:bg-app-canvas">
                <Icon name="user" size={15} /> {t("shell.profile")}
              </Link>
              <Link href={SETTINGS_HREF[role]} onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] font-semibold text-app-ink no-underline hover:bg-app-canvas">
                <Icon name="settings" size={15} /> {t("settings")}
              </Link>
              <LanguagePicker variant="compact" />
              <div className="my-1 border-t border-app-line" />
              <div className="px-1.5 pb-1">
                <SignOutButton variant="full" label={t("shell.logOut")} />
              </div>
            </div>
          )}
        </div>
      </header>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      {role !== "admin" && <ConversationsModal open={chatOpen} onClose={() => setChatOpen(false)} role={role} onOpenRequest={openChat} />}
    </>
  );
}
