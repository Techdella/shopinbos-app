"use client";

import { useState, useEffect, useRef } from "react";
import { Icon, MascotAvatar } from "@/components/ui";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  /** Key prefix in the "shell" catalog: search.<id>.label / search.<id>.desc. */
  id: string;
  href: string;
  icon: string;
}

const SEARCH_INDEX: SearchResult[] = [
  { id: "overview", href: "/home", icon: "home" },
  { id: "orders", href: "/home/orders", icon: "cart" },
  { id: "products", href: "/products", icon: "box" },
  { id: "messages", href: "/home/messages", icon: "message" },
  { id: "marketplace", href: "/marketplace", icon: "shop" },
  { id: "customers", href: "/home/customers", icon: "users" },
  { id: "marketing", href: "/home/marketing", icon: "megaphone" },
  { id: "editor", href: "/builder/editor", icon: "palette" },
  { id: "payments", href: "/home/payments", icon: "coin" },
  { id: "analytics", href: "/home/analytics", icon: "chart" },
  { id: "peggy", href: "/home/peggy", icon: "sparkle" },
  { id: "rex", href: "/studio", icon: "bolt" },
  { id: "settings", href: "/home/settings", icon: "settings" },
  { id: "profile", href: "/home/profile", icon: "users" },
  { id: "notifications", href: "/home/notifications", icon: "bell" },
  { id: "social", href: "/home/marketing?tab=Social%20Selling", icon: "chat" },
  { id: "discounts", href: "/home/discounts", icon: "tag" },
  { id: "automations", href: "/home/automations", icon: "automation" },
  { id: "dropship", href: "/home/dropship", icon: "truck" },
  { id: "logo", href: "/studio/logo", icon: "image" },
  { id: "images", href: "/studio/images", icon: "image" },
];

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const t = useT("shell");
  // Shown in the person's language; the English words still match (people often search in English).
  const entries = SEARCH_INDEX.map((r) => ({
    ...r,
    label: t.dynamic(`search.${r.id}.label`),
    description: t.dynamic(`search.${r.id}.desc`),
    english: `${r.id} ${r.href}`,
  }));

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
    ? entries.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.description.toLowerCase().includes(query.toLowerCase()) ||
        r.english.toLowerCase().includes(query.toLowerCase())
      )
    : entries;

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
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            style={{
              flex: 1, border: "none", outline: "none", fontSize: 14,
              fontFamily: "inherit", color: "var(--ink-900)",
              background: "transparent",
            }}
          />
          {query && (
            <button type="button" aria-label={t("search.clear")} onClick={() => setQuery("")}
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
              {t("search.noResults", { query })}
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
