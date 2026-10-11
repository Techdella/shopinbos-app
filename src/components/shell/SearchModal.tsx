"use client";

import { useState, useEffect, useRef } from "react";
import { Icon, MascotAvatar } from "@/components/ui";
import Link from "next/link";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  label: string;
  href: string;
  icon: string;
  description?: string;
}

const SEARCH_INDEX: SearchResult[] = [
  { label: "Overview", href: "/home", icon: "home", description: "Dashboard & KPIs" },
  { label: "Orders", href: "/home/orders", icon: "cart", description: "Manage incoming orders" },
  { label: "Products", href: "/products", icon: "box", description: "Your catalog" },
  { label: "Messages", href: "/home/messages", icon: "message", description: "Supplier and logistics conversations" },
  { label: "Marketplace", href: "/marketplace", icon: "shop", description: "Find supplier products" },
  { label: "Customers", href: "/home/customers", icon: "users", description: "Buyer management" },
  { label: "Marketing", href: "/home/marketing", icon: "megaphone", description: "Campaigns & promotions" },
  { label: "Store editor", href: "/builder/editor", icon: "palette", description: "Customize storefront" },
  { label: "Payments", href: "/home/payments", icon: "coin", description: "Transactions & payouts" },
  { label: "Analytics", href: "/home/analytics", icon: "chart", description: "Sales, visits, channels and marketing" },
  { label: "Ask Peggy", href: "/home/peggy", icon: "sparkle", description: "AI assistant" },
  { label: "Build with Rex", href: "/studio", icon: "bolt", description: "Creative studio" },
  { label: "Settings", href: "/home/settings", icon: "settings", description: "Store & account settings" },
  { label: "Profile", href: "/home/profile", icon: "users", description: "Your seller profile" },
  { label: "Notifications", href: "/home/notifications", icon: "bell", description: "Activity alerts" },
  { label: "Social channels", href: "/home/marketing?tab=Social%20Selling", icon: "chat", description: "Coming soon" },
  { label: "Discounts", href: "/home/discounts", icon: "tag", description: "Coupons & sales events" },
  { label: "Automations", href: "/home/automations", icon: "automation", description: "Workflow automation" },
  { label: "Dropship", href: "/home/dropship", icon: "truck", description: "Dropshipping" },
  { label: "Logo Studio", href: "/studio/logo", icon: "image", description: "AI logo generation" },
  { label: "Image Generator", href: "/studio/images", icon: "image", description: "DALL-E image creation" },
];

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        setVisible(true);
        inputRef.current?.focus();
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === "Enter" && filtered[selectedIdx]) {
        onClose();
        window.location.href = filtered[selectedIdx].href;
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, query, selectedIdx]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const filtered = query.trim()
    ? SEARCH_INDEX.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        (r.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : SEARCH_INDEX;

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{
          background: "rgba(15,25,22,0.35)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease-out",
        }}
      />
      <div
        className="absolute top-[15%] left-1/2 flex flex-col"
        style={{
          width: 540,
          transform: visible ? "translate(-50%, 0)" : "translate(-50%, -20px)",
          opacity: visible ? 1 : 0,
          transition: "transform 200ms ease-out, opacity 200ms ease-out",
        }}
      >
        <div
          className="flex items-center gap-3 px-4"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--ink-150)",
            borderRadius: "14px 14px 0 0",
            borderBottom: "1px solid var(--ink-100)",
            height: 56,
          }}
        >
          <Icon name="search" size={17} color="var(--ink-400)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, orders, products..."
            style={{
              flex: 1, border: "none", outline: "none", fontSize: 14,
              fontFamily: "inherit", color: "var(--ink-900)",
              background: "transparent",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-400)" }}
            >
              <Icon name="x" size={16} />
            </button>
          )}
          <kbd style={{
            fontSize: 10.5, padding: "3px 6px", borderRadius: 5,
            background: "var(--ink-75)", border: "1px solid var(--ink-150)",
            color: "var(--ink-500)", fontFamily: "var(--font-mono)",
          }}>ESC</kbd>
        </div>

        <div
          className="overflow-y-auto"
          style={{
            maxHeight: 380,
            background: "var(--paper)",
            border: "1px solid var(--ink-150)",
            borderTop: "none",
            borderRadius: "0 0 14px 14px",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-400)", fontSize: 13 }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((r, i) => (
              <Link key={r.href} href={r.href} onClick={onClose}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px", textDecoration: "none",
                  background: i === selectedIdx ? "var(--teal-50)" : "transparent",
                  borderBottom: "1px solid var(--ink-75)",
                  transition: "background 0.08s",
                }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: i === selectedIdx ? "var(--teal-100)" : "var(--ink-50)",
                  color: i === selectedIdx ? "var(--teal-700)" : "var(--ink-500)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <Icon name={r.icon as any} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-900)" }}>{r.label}</div>
                  {r.description && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 1 }}>{r.description}</div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
