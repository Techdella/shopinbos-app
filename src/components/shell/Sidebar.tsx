"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV_BY_ROLE, type NavGroup, type NavItem, type Role } from "@/lib/nav";
import { cx } from "@/components/app-ui";
import { SignOutButton } from "./SignOutButton";
import { SupportChatModal } from "./SupportChatModal";
import { useUnreadMessages } from "@/components/conversations/client";
import { TOGGLE_NAV_EVENT, usePreferences, useShellCounts, useIdentity } from "./useShellCounts";

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

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, item: NavItem) {
  if (item.id === "home" || item.id === "dashboard") return pathname === item.href;
  return matches(pathname, item.href) || Boolean(item.children?.some((child) => matches(pathname, child.href)));
}

// Portal name under the wordmark, as in the "Shopinbos Partners" prototype.
const PORTAL_LABEL: Partial<Record<Role, string>> = { logistics_partner: "Partners", supplier: "Suppliers", admin: "Admin" };

export function Sidebar({ role = "seller", storeName, storeSlug, storeInitial, storeLogoUrl, userName }: SidebarProps) {
  const pathname = usePathname();
  const groups = NAV_BY_ROLE[role];
  const counts = useShellCounts();
  const messagesUnread = useUnreadMessages();
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(null);
  const [canHover, setCanHover] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const { prefs } = usePreferences();
  // Store logo and the person's photo stay in step with uploads made anywhere in the app.
  const me = useIdentity({ name: userName, logoUrl: storeLogoUrl });

  // Hover flyouts only where there's a mouse and room for the rail; touch screens expand submenus inline.
  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
    const update = () => setCanHover(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const toggle = () => setMobileOpen((open) => !open);
    window.addEventListener(TOGGLE_NAV_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_NAV_EVENT, toggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setFlyout(null);
  }, [pathname]);

  const badgeFor = (item: NavItem) => {
    // Inbox: unread partner messages (live) in every portal.
    if (item.id === "inbox" && messagesUnread > 0) return { value: messagesUnread, tone: "mint" as const };
    if (role !== "seller" || !counts) return null;
    if (item.id === "orders" && counts.orders > 0) return { value: counts.orders, tone: "accent" as const };
    return null;
  };

  const displayStore = storeName ?? (role === "supplier" ? "Your company" : role === "logistics_partner" ? "Your fleet" : "Your store");
  const initial = storeInitial ?? displayStore.charAt(0).toUpperCase();

  const hidden = new Set(prefs?.hiddenNav ?? []);
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.core || !hidden.has(item.id)) }))
    .filter((group) => group.items.length > 0);

  // Flyout submenu (desktop, hover or keyboard focus), like Shopify and HubSpot. It's position: fixed so the
  // rail's scrolling doesn't clip it; a short delay lets the pointer travel from the item into the panel.
  const showFlyout = (item: NavItem, element: HTMLElement) => {
    if (!item.children?.length || !canHover) return;
    window.clearTimeout(closeTimer.current);
    setFlyout({ id: item.id, top: element.getBoundingClientRect().top });
  };
  const hideFlyout = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setFlyout(null), 140);
  };
  const flyoutItem = flyout ? visibleGroups.flatMap((group) => group.items).find((item) => item.id === flyout.id) : null;

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item);
    const badge = badgeFor(item);
    const children = item.children ?? [];
    // Submenus show inline under the item you're in, and on touch screens when expanded with the chevron.
    const expanded = children.length > 0 && (active || expandedItems[item.id]);
    return (
      <div
        key={item.id}
        data-tour={`nav-${item.id}`}
        onMouseEnter={(event) => showFlyout(item, event.currentTarget)}
        onMouseLeave={hideFlyout}
        onFocus={(event) => showFlyout(item, event.currentTarget)}
        onBlur={hideFlyout}
      >
        <div className="relative flex items-center">
          <Link
            href={item.href}
            aria-current={active && !children.some((child) => child.href === pathname && child.href !== item.href) ? "page" : undefined}
            aria-haspopup={children.length ? "menu" : undefined}
            className={cx(
              "relative flex min-h-[36px] flex-1 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] no-underline transition-colors",
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
            {children.length > 0 && canHover && !active && <Icon name="chevRight" size={13} className="text-app-ink-faint" />}
          </Link>
          {children.length > 0 && !canHover && !active && (
            <button
              type="button"
              aria-label={`${expanded ? "Hide" : "Show"} ${item.label} pages`}
              aria-expanded={Boolean(expanded)}
              onClick={() => setExpandedItems((current) => ({ ...current, [item.id]: !current[item.id] }))}
              className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas"
            >
              <Icon name="chevDown" size={14} className={cx("transition", expanded && "rotate-180")} />
            </button>
          )}
        </div>
        {expanded && (
          <ul className="m-0 mb-1 ml-[26px] mt-0.5 list-none border-l border-app-line p-0 pl-2">
            {children.map((child) => {
              const on = pathname === child.href;
              return (
                <li key={child.id}>
                  <Link
                    href={child.href}
                    aria-current={on ? "page" : undefined}
                    className={cx("flex min-h-[32px] items-center rounded-[8px] px-2.5 text-[13px] no-underline", on ? "font-extrabold text-app-ink" : "font-semibold text-app-ink-soft hover:bg-app-canvas hover:text-app-ink")}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const renderGroup = (group: NavGroup) => (
    <div key={group.group} className={cx("flex flex-col gap-px", group.pinBottom && "mt-auto pt-4")}>
      {group.label && <div className="mx-2.5 mb-1 mt-3.5 text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#9A96A8]">{group.label}</div>}
      {group.items.map(renderItem)}
    </div>
  );

  const rail = (
    <aside className="relative flex h-full w-[244px] shrink-0 flex-col gap-px overflow-y-auto border-r border-app-line bg-white px-3 pb-5 pt-4 font-app text-app-ink" aria-label="Main">
      <div className="flex items-center justify-between px-1.5 pb-3.5 pt-0.5">
        <Link href={NAV_BY_ROLE[role][0]?.items[0]?.href ?? "/"} aria-label="Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/app/wordmark-dark.png" alt="Shopinbos" className="block h-auto w-[150px]" />
          {PORTAL_LABEL[role] && <span className="mt-1 block text-[11px] font-extrabold uppercase tracking-[0.8px] text-app-accent-ink">{PORTAL_LABEL[role]}</span>}
        </Link>
        <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
          <Icon name="x" size={18} />
        </button>
      </div>

      {role === "seller" && (
        <>
          <Link href="/home/settings" className="mb-2.5 flex min-h-[52px] items-center gap-2.5 rounded-[10px] bg-app-canvas px-2.5 text-app-ink no-underline">
            {me.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.logoUrl} alt="" className="h-8 w-8 rounded-[10px] object-cover" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-app-peach text-[14px] font-extrabold text-app-accent-ink">{initial}</span>
            )}
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px]">{displayStore}</b>
              <span className="block truncate text-[11.5px] text-app-ink-soft">{storeSlug ?? "Your shop"}</span>
            </span>
            <Icon name="chevRight" size={14} className="text-app-ink-faint" />
          </Link>
          <Link href="/products/new" data-tour="add-product" className="mb-2 flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-app-accent text-[14px] font-extrabold text-white no-underline hover:brightness-95">
            <Icon name="plus" size={16} strokeWidth={2.4} /> Add product
          </Link>
        </>
      )}

      <nav className="flex flex-1 flex-col gap-px">{visibleGroups.map(renderGroup)}</nav>

      <div className="mt-3 flex items-center gap-1 border-t border-app-line pt-3">
        <Link href={PROFILE_HREF[role]} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-app-ink no-underline hover:bg-app-canvas">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-ink text-[12.5px] font-bold text-white">{(me.name || "U").charAt(0).toUpperCase()}</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{me.name || "Your account"}</span>
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
      {flyoutItem?.children && flyout && (
        <div
          role="menu"
          aria-label={`${flyoutItem.label} pages`}
          onMouseEnter={() => window.clearTimeout(closeTimer.current)}
          onMouseLeave={hideFlyout}
          className="fixed left-[236px] z-50 hidden min-w-[220px] rounded-[16px] border border-app-line bg-white p-1.5 font-app shadow-[0_18px_40px_-12px_rgba(22,20,31,0.25)] lg:block"
          style={{ top: Math.max(8, Math.min(flyout.top - 6, window.innerHeight - 48 - flyoutItem.children.length * 38)) }}
        >
          <div className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#9A96A8]">{flyoutItem.label}</div>
          {flyoutItem.children.map((child) => (
            <Link
              key={child.id}
              role="menuitem"
              href={child.href}
              onClick={() => setFlyout(null)}
              onFocus={() => window.clearTimeout(closeTimer.current)}
              onBlur={hideFlyout}
              className={cx("flex min-h-[38px] items-center rounded-[10px] px-3 text-[13.5px] no-underline", pathname === child.href ? "bg-[#F1EFF6] font-extrabold text-app-ink" : "font-semibold text-app-ink hover:bg-app-canvas")}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
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
