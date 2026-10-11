"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV_BY_ROLE, type NavGroup, type NavItem, type Role } from "@/lib/nav";
import { cx } from "@/components/app-ui";
import { SignOutButton } from "./SignOutButton";
import { SupportChatModal } from "./SupportChatModal";
import { TOGGLE_NAV_EVENT, useShellCounts } from "./useShellCounts";

// App sidebar in the 2026 design (Seller app · web mockup): white rail, store card, orange "Add product",
// grouped nav with an orange bar on the active item. On small screens it slides in from the top bar's menu button.

interface SidebarProps {
  role?: Role;
  storeName?: string;
  storeSlug?: string;
  storeInitial?: string;
  storeLogoUrl?: string | null;
  userName?: string;
}

const ROLE_LABEL: Record<Role, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Logistics", admin: "Admin" };
const PROFILE_HREF: Record<Role, string> = { seller: "/home/profile", supplier: "/supplier/profile", logistics_partner: "/logistics/profile", admin: "/admin/settings" };

function isActive(pathname: string, item: NavItem) {
  if (item.id === "home" || item.id === "dashboard") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Sidebar({ role = "seller", storeName, storeSlug, storeInitial, storeLogoUrl, userName }: SidebarProps) {
  const pathname = usePathname();
  const groups = NAV_BY_ROLE[role];
  const counts = useShellCounts();
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const toggle = () => setMobileOpen((open) => !open);
    window.addEventListener(TOGGLE_NAV_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_NAV_EVENT, toggle);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const badgeFor = (item: NavItem) => {
    if (role !== "seller" || !counts) return null;
    if (item.id === "orders" && counts.orders > 0) return { value: counts.orders, tone: "accent" as const };
    if (item.id === "inbox" && counts.inbox > 0) return { value: counts.inbox, tone: "mint" as const };
    return null;
  };

  const displayStore = storeName ?? (role === "supplier" ? "Your company" : role === "logistics_partner" ? "Your fleet" : "Your store");
  const initial = storeInitial ?? displayStore.charAt(0).toUpperCase();

  const renderGroup = (group: NavGroup) => {
    const containsActive = group.items.some((item) => isActive(pathname, item));
    const open = !group.collapsible || containsActive || openGroups[group.group];
    return (
      <div key={group.group} className={cx("flex flex-col gap-px", group.pinBottom && "mt-auto pt-4")}>
        {group.label &&
          (group.collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenGroups((current) => ({ ...current, [group.group]: !open }))}
              className="mx-2.5 mb-1 mt-3.5 flex items-center justify-between text-left text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#9A96A8] hover:text-app-ink"
            >
              {group.label}
              <Icon name="chevDown" size={13} className={cx("transition", open && "rotate-180")} />
            </button>
          ) : (
            <div className="mx-2.5 mb-1 mt-3.5 text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#9A96A8]">{group.label}</div>
          ))}
        {open &&
          group.items.map((item) => {
            const active = isActive(pathname, item);
            const badge = badgeFor(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-[36px] items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] no-underline transition-colors",
                  active ? "bg-[#F1EFF6] font-extrabold text-app-ink" : "font-semibold text-app-ink-soft hover:bg-app-canvas hover:text-app-ink",
                )}
              >
                {active && <span aria-hidden className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-r-[3px] bg-app-accent" />}
                <Icon name={item.icon} size={17} />
                <span className="flex-1 truncate">{item.label}</span>
                {badge && (
                  <span
                    className={cx(
                      "flex h-5 min-w-[22px] items-center justify-center rounded-[10px] px-1.5 text-[11px] font-extrabold",
                      badge.tone === "accent" ? "bg-app-accent text-white" : "bg-app-mint text-app-forest",
                    )}
                  >
                    {badge.value > 99 ? "99+" : badge.value}
                  </span>
                )}
                {item.tag && (
                  <span className={cx("rounded-full px-2.5 py-1 text-[10.5px] font-bold", item.tag === "AI" ? "bg-app-mint text-app-forest" : "bg-app-canvas text-app-ink-soft")}>
                    {item.tag}
                  </span>
                )}
              </Link>
            );
          })}
      </div>
    );
  };

  const rail = (
    <aside className="flex h-full w-[244px] shrink-0 flex-col gap-px overflow-y-auto border-r border-app-line bg-white px-3 pb-5 pt-4 font-app text-app-ink" aria-label="Main">
      <div className="flex items-center justify-between px-1.5 pb-3.5 pt-0.5">
        <Link href={NAV_BY_ROLE[role][0]?.items[0]?.href ?? "/"} aria-label="Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/app/wordmark-dark.png" alt="Shopinbos" className="block h-auto w-[150px]" />
        </Link>
        <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
          <Icon name="x" size={18} />
        </button>
      </div>

      {role === "seller" && (
        <>
          <Link href="/home/settings" className="mb-2.5 flex min-h-[52px] items-center gap-2.5 rounded-[10px] bg-app-canvas px-2.5 text-app-ink no-underline">
            {storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storeLogoUrl} alt="" className="h-8 w-8 rounded-[10px] object-cover" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-app-peach text-[14px] font-extrabold text-app-accent-ink">{initial}</span>
            )}
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px]">{displayStore}</b>
              <span className="block truncate text-[11.5px] text-app-ink-soft">{storeSlug ?? "Your shop"}</span>
            </span>
            <Icon name="chevRight" size={14} className="text-app-ink-faint" />
          </Link>
          <Link href="/products/new" className="mb-2 flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-app-accent text-[14px] font-extrabold text-white no-underline hover:brightness-95">
            <Icon name="plus" size={16} strokeWidth={2.4} /> Add product
          </Link>
        </>
      )}

      <nav className="flex flex-1 flex-col gap-px">{groups.map(renderGroup)}</nav>

      <div className="mt-3 flex items-center gap-1 border-t border-app-line pt-3">
        <Link href={PROFILE_HREF[role]} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-app-ink no-underline hover:bg-app-canvas">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-ink text-[12.5px] font-bold text-white">{(userName ?? "U").charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{userName ?? "Your account"}</span>
            <span className="block text-[11px] text-app-ink-soft">{ROLE_LABEL[role]}</span>
          </span>
        </Link>
        <button type="button" onClick={() => setHelpOpen(true)} aria-label="Get help" className="grid h-9 w-9 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink">
          <Icon name="info" size={17} />
        </button>
        <SignOutButton variant="icon" />
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-full lg:flex">{rail}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="h-full shadow-2xl">{rail}</div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/35" onClick={() => setMobileOpen(false)} />
        </div>
      )}
      <SupportChatModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
