"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { SearchModal } from "./SearchModal";
import { ConversationsModal } from "./ConversationsModal";
import { SignOutButton } from "./SignOutButton";
import Link from "next/link";

interface GlobalTopBarProps {
  userName?: string;
  userInitials?: string;
  avatarUrl?: string | null;
  email?: string | null;
  role?: string;
  searchPlaceholder?: string;
  unreadCount?: number;
}

export function GlobalTopBar({
  userName = "You",
  userInitials,
  avatarUrl,
  email,
  role = "Seller",
  searchPlaceholder = "Search products, orders, suppliers\u2026",
  unreadCount = 0,
}: GlobalTopBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const initials = userInitials ?? userName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      <div
        className="h-[60px] shrink-0 flex items-center gap-4 px-[22px]"
        style={{
          background: "var(--paper)",
          borderBottom: "1px solid var(--ink-100)",
        }}
      >
        {/* Search */}
        <div
          onClick={() => setSearchOpen(true)}
          className="flex-1 max-w-[520px] h-[38px] flex items-center gap-[9px] px-3 rounded-[10px] text-[13.5px] cursor-pointer"
          style={{
            background: "var(--ink-75)",
            border: "1px solid transparent",
            color: "var(--ink-500)",
          }}
        >
          <Icon name="search" size={16} color="var(--ink-400)" />
          <span>{searchPlaceholder}</span>
          <kbd
            className="ml-auto text-[10.5px] px-[5px] py-px rounded-[4px]"
            style={{
              background: "var(--paper)",
              border: "1px solid var(--ink-150)",
              color: "var(--ink-500)",
              fontFamily: "var(--font-mono)",
            }}
          >
            \u2318K
          </kbd>
        </div>

        <div className="flex-1" />

        {/* Notifications */}
        <button
          type="button"
          className="relative w-[38px] h-[38px] rounded-[10px] flex items-center justify-center"
          style={{
            border: "1px solid var(--ink-150)",
            background: "var(--paper)",
            color: "var(--ink-600)",
          }}
          aria-label="Notifications"
          onClick={() => setDrawerOpen(true)}
        >
          <Icon name="bell" size={17} />
          {unreadCount > 0 && (
            <>
              <span
                className="absolute top-[7px] right-[8px] w-[7px] h-[7px] rounded-full"
                style={{
                  background: "var(--rose-500)",
                  border: "2px solid var(--paper)",
                }}
              />
              <span
                className="absolute -top-[3px] -right-[3px] flex items-center justify-center"
                style={{
                  background: "var(--rose-500)",
                  color: "white",
                  fontSize: 9,
                  fontWeight: 700,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  padding: "0 4px",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </>
          )}
        </button>

        {/* Chat */}
        <button
          type="button"
          className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center"
          style={{
            border: "1px solid var(--ink-150)",
            background: "var(--paper)",
            color: "var(--ink-600)",
          }}
          aria-label="Messages"
          onClick={() => setChatOpen(true)}
        >
          <Icon name="chat" size={17} />
        </button>

        {/* User pill */}
        <div
          className="flex items-center gap-[9px] pl-1 pr-3 rounded-full relative"
          style={{
            border: "1px solid var(--ink-150)",
            background: "var(--paper)",
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-[30px] h-[30px] rounded-full object-cover"
            />
          ) : (
            <Link
              href="/home/profile"
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-bold text-[12.5px] text-white no-underline"
              style={{ background: "var(--teal-700)" }}
            >
              {initials}
            </Link>
          )}
          <Link href="/home/profile" className="no-underline">
            <div>
              <div className="font-semibold text-[13px] leading-[1.1]" style={{ color: "var(--ink-900)" }}>
                {userName}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-500)" }}>
                {role}
              </div>
            </div>
          </Link>
          <button
            onClick={() => setShowMenu(!showMenu)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-400)", padding: 0 }}
          >
            <Icon name="chevDown" size={14} />
          </button>

          {showMenu && (
            <div
              className="absolute top-full right-0 mt-1 rounded-[12px]"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--ink-150)",
                boxShadow: "var(--shd-lg)",
                minWidth: 180,
                zIndex: 60,
                padding: 6,
              }}
            >
              <Link href="/home/profile"
                className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] no-underline"
                style={{ fontSize: 13, color: "var(--ink-800)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--ink-50)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => setShowMenu(false)}
              >
                <Icon name="users" size={14} /> Profile
              </Link>
              <Link href="/home/settings"
                className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] no-underline"
                style={{ fontSize: 13, color: "var(--ink-800)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--ink-50)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => setShowMenu(false)}
              >
                <Icon name="settings" size={14} /> Settings
              </Link>
              {email && (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-[8px]"
                  style={{ fontSize: 12, color: "var(--ink-400)" }}
                >
                  <Icon name="mail" size={14} /> {email}
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--ink-100)", margin: "4px 0" }} />
              <div className="px-2" onClick={() => setShowMenu(false)}>
                <SignOutButton variant="full" label="Sign out" />
              </div>
            </div>
          )}
        </div>
      </div>

      <NotificationsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ConversationsModal open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
