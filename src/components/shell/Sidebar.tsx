"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV_BY_ROLE, type Role } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./SignOutButton";
import { SupportChatModal } from "./SupportChatModal";
import { useRexDrawer } from "@/components/rex/RexDrawerContext";
import { ChipAvatar } from "@/components/brand/ChipAvatar";

interface SidebarProps {
  role?: Role;
  storeName?: string;
  storeSlug?: string;
  storeInitial?: string;
  storeLogoUrl?: string | null;
  userName?: string;
}

export function Sidebar({
  role = "seller",
  storeName,
  storeSlug,
  storeInitial,
  storeLogoUrl,
  userName,
}: SidebarProps) {
  const pathname = usePathname();
  const groups = NAV_BY_ROLE[role];
  const [helpOpen, setHelpOpen] = useState(false);

  const isActive = (id: string, href: string) =>
    pathname === href || (id !== "home" && id !== "dashboard" && pathname.startsWith(href));

  const displayInitial = storeInitial ?? storeName?.charAt(0).toUpperCase() ?? "S";
  const displayStore   = storeName  ?? (role === "supplier" ? "Your Company" : role === "logistics_partner" ? "Your Fleet" : "Your Store");
  const displaySlug    = storeSlug  ?? (role === "seller" ? "yourstore.shopinbos.shop" : "");

  const assistantCard =
    role === "seller" ? (
      <div
        className="relative overflow-hidden rounded-[14px] p-3"
        style={{ background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))" }}
      >
        <div className="flex items-center gap-1.5 mb-1 font-semibold text-[12.5px]" style={{ color: "var(--ink-900)" }}>
          <Icon name="sparkle" size={13} color="var(--teal-700)" />
          Peggy
          <span className="ml-1 rounded-[4px] px-1.5 py-px text-[9px] font-bold tracking-wide text-white" style={{ background: "var(--teal-700)" }}>BETA</span>
        </div>
        <div className="text-[11.5px] leading-[1.4] mb-2" style={{ color: "var(--ink-600)" }}>
          Daily tips, drafts and reminders for your shop.
        </div>
        <Link
          href="/peggy"
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-white no-underline"
          style={{ background: "var(--ink-900)" }}
        >
          Ask Peggy <Icon name="arrow" size={11} color="white" />
        </Link>
        <div className="absolute right-[-6px] bottom-[-8px] w-[62px] h-[62px] opacity-90 pointer-events-none">
          <Image
            src="/brand/mascots/peggy-1.png"
            alt="Peggy"
            width={62}
            height={62}
            className="object-contain"
          />
        </div>
      </div>
    ) : role === "supplier" ? (
      <div
        className="rounded-[14px] p-3"
        style={{ background: "linear-gradient(160deg, #fbeed4, #f6dfb0)" }}
      >
        <div className="flex items-center gap-1.5 mb-1 font-semibold text-[12.5px]" style={{ color: "var(--ink-900)" }}>
          <Icon name="bolt" size={13} color="#b97511" />
          Boost your reach
        </div>
        <div className="text-[11.5px] leading-[1.4] mb-2" style={{ color: "var(--ink-700)" }}>
          Upgrade product photos to lookbook quality.
        </div>
        <button
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
          style={{ background: "var(--ink-900)" }}
        >
          Upgrade photos <Icon name="arrow" size={11} color="white" />
        </button>
      </div>
    ) : (
      <div
        className="rounded-[14px] p-3"
        style={{ background: "linear-gradient(160deg, #dfe5f7, #c4cdf0)" }}
      >
        <div className="flex items-center gap-1.5 mb-1 font-semibold text-[12.5px]" style={{ color: "var(--ink-900)" }}>
          <Icon name="rocket" size={13} color="#3a4ba6" />
          Get more bookings
        </div>
        <div className="text-[11.5px] leading-[1.4] mb-2" style={{ color: "var(--ink-700)" }}>
          Expand to new zones to reach more sellers.
        </div>
        <button
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold text-white"
          style={{ background: "var(--ink-900)" }}
        >
          See zones <Icon name="arrow" size={11} color="white" />
        </button>
      </div>
    );

  return (
    <>
      <aside
        className="w-[240px] shrink-0 flex flex-col h-full overflow-hidden"
        style={{
          background: "var(--paper)",
          borderRight: "1px solid var(--ink-100)",
          padding: "18px 14px",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-1.5 pb-[18px]">
          <Image
            src="/brand/logos/shopinbos-logo-dark.png"
            alt="Shopinbos"
            width={130}
            height={22}
            className="object-contain"
            style={{ height: 22, width: "auto" }}
            priority
          />
        </div>

        {/* Store picker */}
        {role === "seller" && (
          <div
            className="flex items-center gap-2.5 rounded-[12px] mb-[14px] px-2.5 py-2"
            style={{
              background: "var(--ink-50)",
              border: "1px solid var(--ink-150)",
            }}
          >
            {storeLogoUrl ? (
              <div className="w-8 h-8 rounded-[8px] overflow-hidden shrink-0">
                <Image src={storeLogoUrl} alt={displayStore} width={32} height={32} style={{ objectFit: "cover" }} unoptimized />
              </div>
            ) : (
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white font-bold shrink-0 text-[13px]"
                style={{ background: "linear-gradient(135deg, #e8a647, #c84a32)", fontFamily: "var(--font-accent)" }}
              >
                {displayInitial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div
                className="font-semibold text-[13.5px] truncate"
                style={{ color: "var(--ink-900)", lineHeight: 1.2 }}
              >
                {displayStore}
              </div>
              {displaySlug && (
                <div className="text-[11.5px] truncate" style={{ color: "var(--ink-500)" }}>
                  {displaySlug}
                </div>
              )}
            </div>
            <Icon name="chevDown" size={14} color="var(--ink-400)" />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5 pb-1">
              {g.label && (
                <div
                  className="px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.08em] font-semibold"
                  style={{ color: "var(--ink-400)" }}
                >
                  {g.label}
                </div>
              )}
              {g.items.map((item) => {
                const active = isActive(item.id, item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13.5px] font-medium no-underline transition-colors duration-100",
                      active
                        ? "font-semibold"
                        : "hover:bg-[var(--ink-50)]",
                    )}
                    style={{
                      background: active ? "var(--teal-100)" : undefined,
                      color: active ? "var(--teal-800)" : "var(--ink-700)",
                    }}
                  >
                    <span
                      className="w-[18px] h-[18px] flex items-center justify-center shrink-0"
                      style={{ color: active ? "var(--teal-700)" : "var(--ink-500)" }}
                    >
                      <Icon name={item.icon} size={17} color="currentColor" />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className="rounded-full px-[7px] py-px text-[11px] font-semibold"
                        style={{
                          background: active ? "var(--teal-200)" : "var(--ink-100)",
                          color: active ? "var(--teal-800)" : "var(--ink-700)",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.isNew && (
                      <span className="rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide text-white bg-[var(--rose-500)]">
                        NEW
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div
          className="flex flex-col gap-2.5 pt-3"
          style={{ borderTop: "1px solid var(--ink-100)", marginTop: 8 }}
        >
          {assistantCard}

          {/* Rex — opens assistant drawer */}
          <SidebarRexWidget />

          {/* Need help — opens support modal */}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[12.5px] w-full"
            style={{
              color: "var(--ink-600)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--ink-50)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--ink-100)" }}
            >
              <Icon name="users" size={15} color="var(--ink-500)" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[12.5px]" style={{ color: "var(--ink-800)" }}>
                Need help?
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-500)" }}>
                24/7 support
              </div>
            </div>
          </button>

          {/* User row + sign out */}
          {userName && (
            <div className="flex items-center gap-1">
              <Link
                href="/home/profile"
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] no-underline hover:bg-[var(--ink-50)] flex-1 min-w-0"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12.5px] font-bold text-white shrink-0"
                  style={{ background: "var(--teal-700)" }}
                >
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] truncate" style={{ color: "var(--ink-900)" }}>
                    {userName}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ink-500)" }}>
                    {role === "seller" ? "Seller" : role === "supplier" ? "Supplier" : role === "logistics_partner" ? "Logistics" : "Admin"}
                  </div>
                </div>
              </Link>
              <SignOutButton variant="icon" />
            </div>
          )}
        </div>
      </aside>

      <SupportChatModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function SidebarRexWidget() {
  const { openDrawer } = useRexDrawer();

  return (
    <button
      type="button"
      onClick={() => openDrawer()}
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[12.5px] w-full"
      style={{
        color: "var(--ink-600)",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--ink-50)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <ChipAvatar mascot="rex" size={30} />
      <div className="flex-1">
        <div className="font-semibold text-[12.5px]" style={{ color: "var(--ink-800)" }}>
          Ask Rex
        </div>
        <div className="text-[11px]" style={{ color: "var(--ink-500)" }}>
          Need help? Chat anytime.
        </div>
      </div>
    </button>
  );
}
