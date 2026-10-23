"use client";

import { useEffect, useState } from "react";
import { useRexDrawer } from "./RexDrawerContext";
import { Icon } from "@/components/ui/Icon";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { storageGet, storageRemove, storageSet } from "@/lib/safe-storage";

interface SetupBannerProps {
  percent: number;
  productsNeeded: number;
  paymentNeeded: boolean;
  storeName?: string;
  hasLogo?: boolean;
  hasTheme?: boolean;
  hasDelivery?: boolean;
  isPublished?: boolean;
}

const CHECKLIST_ITEMS = [
  { key: "name", label: "Add store name" },
  { key: "logo", label: "Upload logo" },
  { key: "products", label: "Add products" },
  { key: "theme", label: "Choose theme" },
  { key: "delivery", label: "Configure delivery" },
  { key: "payments", label: "Configure payments" },
  { key: "publish", label: "Publish store" },
];

export function SetupBanner({
  percent,
  productsNeeded,
  paymentNeeded,
  storeName = "",
  hasLogo = false,
  hasTheme = false,
  hasDelivery = false,
  isPublished = false,
}: SetupBannerProps) {
  const { openDrawer } = useRexDrawer();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(storageGet("sessionStorage", "shopinbos:rex-setup-dismissed") === "true");
  }, []);

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          storageRemove("sessionStorage", "shopinbos:rex-setup-dismissed");
          setDismissed(false);
          openDrawer("Help me finish setting up my store.");
        }}
        className="dbtn dBtn-ghost dBtn-sm"
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <ChipAvatar mascot="rex" size={24} />
        Bring Rex back
      </button>
    );
  }

  const checklist = CHECKLIST_ITEMS.map((item) => {
    if (item.key === "name") return { ...item, done: !!storeName };
    if (item.key === "logo") return { ...item, done: hasLogo };
    if (item.key === "products") return { ...item, done: productsNeeded === 0 };
    if (item.key === "theme") return { ...item, done: hasTheme };
    if (item.key === "delivery") return { ...item, done: hasDelivery };
    if (item.key === "payments") return { ...item, done: !paymentNeeded };
    if (item.key === "publish") return { ...item, done: isPublished };
    return { ...item, done: false };
  });

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div
      className="rex-setup-banner"
      style={{
        display: "flex",
        gap: 16,
        borderRadius: 16,
        padding: "16px 20px",
        background: "var(--paper, #fff)",
        border: "1px solid var(--ink-100, #E3DDD0)",
        position: "relative",
      }}
    >
      <div
        style={{
          width: 48, height: 48, borderRadius: 12, background: "var(--teal-50, #C7ECE3)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <ChipAvatar mascot="rex" size={32} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-900, #0B262C)", marginBottom: 6 }}>
          Store Setup · {doneCount}/{checklist.length} complete
        </div>

        <div
          style={{
            width: "100%", maxWidth: 320, height: 5, borderRadius: 3,
            background: "var(--ink-100, #E3DDD0)", overflow: "hidden", marginBottom: 12,
          }}
        >
          <div
            style={{
              width: `${percent}%`, height: "100%", borderRadius: 3,
              background: "var(--teal-600, #2EB39A)", transition: "width 0.5s ease",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
          {checklist.map((item) => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: item.done ? "var(--teal-700)" : "var(--ink-500)" }}>
              <span style={{ color: item.done ? "var(--teal-600)" : "var(--ink-300)", fontSize: 13, lineHeight: 1 }}>
                {item.done ? "✓" : "○"}
              </span>
              <span style={{ fontWeight: item.done ? 500 : 400 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0, justifyContent: "center" }}>
        <button
          onClick={() => openDrawer()}
          style={{
            padding: "7px 18px", borderRadius: 20, border: "none",
            background: "var(--teal-700, #1B7B6A)", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          Continue <Icon name="arrow" size={12} color="white" />
        </button>
        <div style={{ fontSize: 11, color: "var(--ink-400)" }}>Rex will help</div>
      </div>

      <button
        type="button"
        onClick={() => {
          storageSet("sessionStorage", "shopinbos:rex-setup-dismissed", "true");
          setDismissed(true);
        }}
        style={{
          position: "absolute", top: 8, right: 8,
          width: 24, height: 24, borderRadius: 6, border: "none",
          background: "transparent", cursor: "pointer",
          display: "grid", placeItems: "center", color: "var(--ink-400)",
        }}
        aria-label="Dismiss"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
