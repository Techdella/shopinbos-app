"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MascotAvatar } from "@/components/ui";

const DISMISS_KEY = "shopinbos-store-not-built-dismissed";

export function StoreNotBuiltGuard() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY) === "true";
    setShow(!dismissed);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(14, 42, 56, 0.6)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
      animation: "fadeIn 0.3s ease",
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div className="card" style={{
        maxWidth: 480, width: "100%",
        padding: "32px 28px",
        textAlign: "center",
        animation: "fadeIn 0.3s ease",
      }}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
          <MascotAvatar role="supplier" size={80} />
        </div>
        <h2 style={{
          fontSize: 20, fontWeight: 700, margin: "0 0 6px",
          color: "var(--ink-900)", fontFamily: "var(--font-display)",
        }}>
          Your store isn't built yet! 🚀
        </h2>
        <p style={{
          fontSize: 14, lineHeight: 1.6, margin: "0 0 20px",
          color: "var(--ink-600)",
        }}>
          You don't have a logo, products, or store pages yet. Want to build it together? I'll guide you through every step!
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
          <Link href="/builder" className="dbtn dBtn-mint" style={{ textDecoration: "none", fontSize: 14, padding: "10px 24px" }}>
            Let's build!
          </Link>
          <Link href="/builder/templates" className="dbtn dBtn-ghost" style={{ textDecoration: "none", fontSize: 14, padding: "10px 24px" }}>
            Pick a template
          </Link>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 12.5, color: "var(--ink-400)",
            textDecoration: "underline",
            padding: 4,
          }}
        >
          I'll do it later
        </button>
      </div>
    </div>
  );
}
