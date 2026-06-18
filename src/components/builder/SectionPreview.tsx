"use client";

import { useMemo, useState } from "react";
import { createSectionFromLibrary } from "@/lib/store-templates/http";
import type { TemplateSectionNode } from "@/lib/store-templates";

interface SectionPreviewProps {
  kind: string;
  label: string;
  /** Optional - pass in a pre-created section node to avoid recreating */
  section?: TemplateSectionNode;
}

const SECTION_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  "hero-split": { primary: "#0E9E85", secondary: "#E8F5F2", accent: "#F0C27A" },
  "featured-products": { primary: "#7C3AED", secondary: "#F3EEFF", accent: "#C4B5FD" },
  testimonials: { primary: "#F59E0B", secondary: "#FFF7ED", accent: "#FDE68A" },
  newsletter: { primary: "#3B82F6", secondary: "#EFF6FF", accent: "#93C5FD" },
  "contact-form": { primary: "#10B981", secondary: "#ECFDF5", accent: "#6EE7B7" },
  faq: { primary: "#8B5CF6", secondary: "#F5F3FF", accent: "#C4B5FD" },
  "promo-banner": { primary: "#EF4444", secondary: "#FEF2F2", accent: "#FCA5A5" },
  "text-columns": { primary: "#6366F1", secondary: "#EEF2FF", accent: "#A5B4FC" },
  "story-split": { primary: "#EC4899", secondary: "#FDF2F8", accent: "#F9A8D4" },
  header: { primary: "#1E293B", secondary: "#F8FAFC", accent: "#94A3B8" },
  footer: { primary: "#334155", secondary: "#F1F5F9", accent: "#CBD5E1" },
  "trust-strip": { primary: "#14B8A6", secondary: "#F0FDFA", accent: "#5EEAD4" },
  "category-grid": { primary: "#F97316", secondary: "#FFF7ED", accent: "#FDBA74" },
  "announcement-bar": { primary: "#6B7280", secondary: "#F3F4F6", accent: "#D1D5DB" },
  "blog-index": { primary: "#0EA5E9", secondary: "#F0F9FF", accent: "#7DD3FC" },
  "about-section": { primary: "#84CC16", secondary: "#F7FEE7", accent: "#BEF264" },
  "delivery-info": { primary: "#06B6D4", secondary: "#ECFEFF", accent: "#67E8F9" },
  "payment-info": { primary: "#0D9488", secondary: "#F0FDFA", accent: "#5EEAD4" },
  "filters-toolbar": { primary: "#78716C", secondary: "#F5F5F4", accent: "#D6D3D1" },
  "category-list": { primary: "#D97706", secondary: "#FFFBEB", accent: "#FCD34D" },
  "product-detail": { primary: "#0891B2", secondary: "#ECFEFF", accent: "#67E8F9" },
  "cart-summary": { primary: "#4F46E5", secondary: "#EEF2FF", accent: "#A5B4FC" },
  "checkout-form": { primary: "#059669", secondary: "#ECFDF5", accent: "#6EE7B7" },
  "wishlist-grid": { primary: "#DB2777", secondary: "#FDF2F8", accent: "#F9A8D4" },
  "contact-form": { primary: "#2563EB", secondary: "#EFF6FF", accent: "#93C5FD" },
  "default": { primary: "#6B7280", secondary: "#F3F4F6", accent: "#D1D5DB" },
};

function getColors(kind: string) {
  return SECTION_COLORS[kind] ?? SECTION_COLORS.default;
}

function LayoutIcon({ kind }: { kind: string }) {
  const c = getColors(kind);
  const size = 40;

  switch (kind) {
    case "hero-split":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="4" y="6" width="14" height="4" rx="1.5" fill={c.primary} opacity="0.5" />
          <rect x="4" y="12" width="18" height="2" rx="1" fill={c.primary} opacity="0.25" />
          <rect x="4" y="16" width="12" height="2" rx="1" fill={c.primary} opacity="0.25" />
          <rect x="22" y="6" width="14" height="20" rx="2" fill={c.accent} opacity="0.5" />
          <rect x="22" y="28" width="14" height="8" rx="2" fill={c.primary} opacity="0.2" />
        </svg>
      );
    case "featured-products":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="3" y="4" width="16" height="21" rx="2" fill={c.primary} opacity="0.2" />
          <rect x="3" y="27" width="16" height="3" rx="1" fill={c.primary} opacity="0.3" />
          <rect x="3" y="31" width="10" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="21" y="4" width="16" height="21" rx="2" fill={c.accent} opacity="0.3" />
          <rect x="21" y="27" width="16" height="3" rx="1" fill={c.accent} opacity="0.4" />
          <rect x="21" y="31" width="10" height="2" rx="1" fill={c.accent} opacity="0.2" />
        </svg>
      );
    case "testimonials":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="4" y="4" width="32" height="10" rx="2" fill={c.primary} opacity="0.15" />
          <circle cx="12" cy="9" r="2" fill={c.primary} opacity="0.3" />
          <rect x="16" y="6" width="16" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="16" y="9.5" width="10" height="1.5" rx="1" fill={c.primary} opacity="0.12" />
          <rect x="4" y="16" width="32" height="10" rx="2" fill={c.accent} opacity="0.2" />
          <circle cx="12" cy="21" r="2" fill={c.accent} opacity="0.35" />
          <rect x="16" y="18" width="16" height="2" rx="1" fill={c.accent} opacity="0.25" />
          <rect x="16" y="21.5" width="10" height="1.5" rx="1" fill={c.accent} opacity="0.15" />
          <rect x="4" y="28" width="32" height="10" rx="2" fill={c.primary} opacity="0.15" />
          <circle cx="12" cy="33" r="2" fill={c.primary} opacity="0.3" />
        </svg>
      );
    case "newsletter":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="6" y="10" width="28" height="20" rx="3" fill={c.primary} opacity="0.12" stroke={c.primary} strokeWidth="0.8" strokeOpacity="0.3" />
          <rect x="8" y="12" width="24" height="12" rx="1.5" fill={c.primary} opacity="0.08" />
          <rect x="8" y="12" width="16" height="2" rx="1" fill={c.primary} opacity="0.25" />
          <rect x="8" y="15.5" width="20" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="8" y="19" width="14" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="10" y="26" width="12" height="4" rx="2" fill={c.primary} opacity="0.3" />
          <rect x="24" y="26" width="8" height="4" rx="2" fill={c.accent} opacity="0.5" />
        </svg>
      );
    case "contact-form":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="6" y="6" width="28" height="4" rx="1" fill={c.primary} opacity="0.08" />
          <rect x="6" y="12" width="28" height="4" rx="1" fill={c.primary} opacity="0.12" />
          <rect x="6" y="18" width="28" height="4" rx="1" fill={c.primary} opacity="0.08" />
          <rect x="6" y="24" width="28" height="6" rx="1" fill={c.primary} opacity="0.12" />
          <rect x="22" y="32" width="12" height="4" rx="2" fill={c.primary} opacity="0.3" />
        </svg>
      );
    case "faq":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="4" y="4" width="32" height="9" rx="2" fill={c.primary} opacity="0.12" />
          <rect x="4" y="7" width="28" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="34" y="7" width="1.5" height="2" rx="0.75" fill={c.primary} opacity="0.3" />
          <rect x="4" y="15" width="32" height="9" rx="2" fill={c.accent} opacity="0.15" />
          <rect x="4" y="18" width="24" height="2" rx="1" fill={c.accent} opacity="0.2" />
          <rect x="34" y="18" width="1.5" height="2" rx="0.75" fill={c.accent} opacity="0.35" />
          <rect x="4" y="26" width="32" height="9" rx="2" fill={c.primary} opacity="0.12" />
          <rect x="4" y="29" width="20" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="34" y="29" width="1.5" height="2" rx="0.75" fill={c.primary} opacity="0.3" />
        </svg>
      );
    case "promo-banner":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="2" y="10" width="36" height="20" rx="3" fill={c.primary} opacity="0.12" />
          <rect x="6" y="16" width="28" height="3" rx="1.5" fill={c.primary} opacity="0.3" />
          <rect x="10" y="21" width="20" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="30" y="24" width="6" height="2" rx="1" fill={c.accent} opacity="0.5" />
        </svg>
      );
    case "text-columns":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="3" y="4" width="11" height="32" rx="1.5" fill={c.primary} opacity="0.08" />
          <rect x="3" y="6" width="11" height="2" rx="1" fill={c.primary} opacity="0.25" />
          <rect x="3" y="10" width="9" height="2" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="3" y="14" width="11" height="2" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="3" y="18" width="8" height="2" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="14.5" y="4" width="11" height="32" rx="1.5" fill={c.accent} opacity="0.12" />
          <rect x="14.5" y="6" width="11" height="2" rx="1" fill={c.accent} opacity="0.3" />
          <rect x="14.5" y="10" width="9" height="2" rx="1" fill={c.accent} opacity="0.15" />
          <rect x="14.5" y="14" width="11" height="2" rx="1" fill={c.accent} opacity="0.15" />
          <rect x="14.5" y="18" width="8" height="2" rx="1" fill={c.accent} opacity="0.15" />
          <rect x="26" y="4" width="11" height="32" rx="1.5" fill={c.primary} opacity="0.08" />
          <rect x="26" y="6" width="11" height="2" rx="1" fill={c.primary} opacity="0.25" />
          <rect x="26" y="10" width="9" height="2" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="26" y="14" width="11" height="2" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="26" y="18" width="8" height="2" rx="1" fill={c.primary} opacity="0.1" />
        </svg>
      );
    case "story-split":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="2" y="4" width="18" height="32" rx="2" fill={c.accent} opacity="0.4" />
          <rect x="22" y="6" width="16" height="3" rx="1.5" fill={c.primary} opacity="0.3" />
          <rect x="22" y="11" width="14" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="22" y="15" width="16" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="22" y="19" width="12" height="2" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="22" y="28" width="14" height="4" rx="2" fill={c.primary} opacity="0.3" />
        </svg>
      );
    case "header":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="0" y="0" width="40" height="10" rx="2" fill={c.primary} opacity="0.08" />
          <rect x="6" y="2" width="8" height="6" rx="1.5" fill={c.primary} opacity="0.3" />
          <rect x="18" y="3" width="5" height="1.5" rx="0.75" fill={c.primary} opacity="0.15" />
          <rect x="25" y="3" width="5" height="1.5" rx="0.75" fill={c.primary} opacity="0.15" />
          <rect x="32" y="3" width="3" height="1.5" rx="0.75" fill={c.primary} opacity="0.15" />
        </svg>
      );
    case "footer":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="0" y="28" width="40" height="12" rx="2" fill={c.primary} opacity="0.1" />
          <rect x="4" y="30" width="8" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="4" y="33.5" width="6" height="1.5" rx="0.75" fill={c.primary} opacity="0.12" />
          <rect x="14" y="30" width="8" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="14" y="33.5" width="6" height="1.5" rx="0.75" fill={c.primary} opacity="0.12" />
          <rect x="24" y="30" width="8" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="24" y="33.5" width="6" height="1.5" rx="0.75" fill={c.primary} opacity="0.12" />
        </svg>
      );
    case "trust-strip":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="2" y="14" width="10" height="12" rx="2" fill={c.primary} opacity="0.12" />
          <circle cx="7" cy="18" r="2" fill={c.primary} opacity="0.25" />
          <rect x="4" y="21.5" width="6" height="1.5" rx="0.75" fill={c.primary} opacity="0.15" />
          <rect x="15" y="14" width="10" height="12" rx="2" fill={c.accent} opacity="0.15" />
          <circle cx="20" cy="18" r="2" fill={c.accent} opacity="0.3" />
          <rect x="17" y="21.5" width="6" height="1.5" rx="0.75" fill={c.accent} opacity="0.2" />
          <rect x="28" y="14" width="10" height="12" rx="2" fill={c.primary} opacity="0.12" />
          <circle cx="33" cy="18" r="2" fill={c.primary} opacity="0.25" />
          <rect x="30" y="21.5" width="6" height="1.5" rx="0.75" fill={c.primary} opacity="0.15" />
        </svg>
      );
    case "category-grid":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="2" y="2" width="17" height="17" rx="3" fill={c.accent} opacity="0.3" />
          <rect x="2" y="4" width="10" height="1.5" rx="0.75" fill={c.accent} opacity="0.4" />
          <rect x="21" y="2" width="17" height="17" rx="3" fill={c.primary} opacity="0.12" />
          <rect x="22.5" y="4.5" width="14" height="13" rx="2" fill={c.primary} opacity="0.08" />
          <rect x="2" y="21" width="17" height="17" rx="3" fill={c.primary} opacity="0.12" />
          <rect x="3.5" y="23.5" width="14" height="13" rx="2" fill={c.primary} opacity="0.08" />
          <rect x="21" y="21" width="17" height="17" rx="3" fill={c.accent} opacity="0.3" />
          <rect x="21" y="23" width="10" height="1.5" rx="0.75" fill={c.accent} opacity="0.4" />
        </svg>
      );
    case "announcement-bar":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="0" y="14" width="40" height="12" rx="2" fill={c.primary} opacity="0.12" />
          <rect x="8" y="18" width="24" height="3" rx="1.5" fill={c.primary} opacity="0.3" />
        </svg>
      );
    case "blog-index":
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="4" y="3" width="32" height="12" rx="2" fill={c.primary} opacity="0.08" />
          <rect x="6" y="5" width="6" height="8" rx="1.5" fill={c.primary} opacity="0.15" />
          <rect x="14" y="6" width="18" height="2" rx="1" fill={c.primary} opacity="0.2" />
          <rect x="14" y="9.5" width="14" height="1.5" rx="0.75" fill={c.primary} opacity="0.12" />
          <rect x="4" y="17" width="32" height="12" rx="2" fill={c.accent} opacity="0.12" />
          <rect x="6" y="19" width="6" height="8" rx="1.5" fill={c.accent} opacity="0.2" />
          <rect x="14" y="20" width="18" height="2" rx="1" fill={c.accent} opacity="0.25" />
          <rect x="14" y="23.5" width="14" height="1.5" rx="0.75" fill={c.accent} opacity="0.15" />
          <rect x="4" y="31" width="32" height="6" rx="2" fill={c.primary} opacity="0.08" />
          <rect x="6" y="32" width="6" height="4" rx="1.5" fill={c.primary} opacity="0.15" />
          <rect x="14" y="32.5" width="8" height="1.5" rx="0.75" fill={c.primary} opacity="0.12" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="4" fill={c.secondary} />
          <rect x="4" y="6" width="32" height="4" rx="1" fill={c.primary} opacity="0.15" />
          <rect x="4" y="12" width="24" height="3" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="4" y="17" width="32" height="3" rx="1" fill={c.accent} opacity="0.15" />
          <rect x="4" y="22" width="18" height="3" rx="1" fill={c.primary} opacity="0.1" />
          <rect x="4" y="27" width="32" height="4" rx="1" fill={c.primary} opacity="0.12" />
        </svg>
      );
  }
}

export function SectionPreviewCard({ kind, label, section }: SectionPreviewProps) {
  const sectionNode = useMemo(() => {
    try {
      return section ?? createSectionFromLibrary(kind);
    } catch { return null; }
  }, [kind, section]);

  const blockCount = sectionNode?.blocks?.length ?? 0;
  const itemCount = sectionNode?.items?.length ?? 0;
  const colors = getColors(kind);

  return (
    <div
      style={{
        width: 220,
        padding: 12,
        borderRadius: 12,
        background: "white",
        border: "1px solid var(--ink-200)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 60 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: colors.secondary,
          display: "grid", placeItems: "center",
        }}>
          <LayoutIcon kind={kind} />
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--ink-800)" }}>
        {label}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, fontSize: 11, color: "var(--ink-500)" }}>
        {blockCount > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: colors.primary, display: "inline-block" }} />
            {blockCount} {blockCount === 1 ? "block" : "blocks"}
          </span>
        )}
        {itemCount > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.accent, display: "inline-block" }} />
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {sectionNode && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 3,
          justifyContent: "center", marginTop: 2,
        }}>
          {(sectionNode.blocks ?? []).slice(0, 4).map((block, i) => (
            <div
              key={i}
              style={{
                width: 36, height: 6, borderRadius: 3,
                background: block.type === "image" ? colors.accent : colors.primary,
                opacity: block.type === "image" ? 0.4 : 0.2,
              }}
            />
          ))}
        </div>
      )}

      {itemCount > 0 && (
        <div style={{
          display: "flex", gap: 4, justifyContent: "center",
          borderTop: "1px solid var(--ink-100)", paddingTop: 8,
        }}>
          {(sectionNode?.items ?? []).slice(0, 3).map((_item, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 20, borderRadius: 4,
                background: colors.secondary,
                border: `1px solid ${colors.primary}20`,
              }}
            />
          ))}
        </div>
      )}

      <div style={{
        fontSize: 10, color: "var(--ink-400)", textAlign: "center",
        paddingTop: 4, borderTop: "1px solid var(--ink-100)",
      }}>
        {kind.replace(/-/g, " ")}
      </div>
    </div>
  );
}

interface SectionInfo {
  id: string;
  label: string;
}

export function SectionPreviewPopover({
  section,
  children,
  position = "right",
}: {
  section: SectionInfo;
  children: React.ReactNode;
  position?: "right" | "left" | "top";
}) {
  const [show, setShow] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-block", width: "100%" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}

      {show && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            ...(position === "right" ? { left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: 12 } : {}),
            ...(position === "left" ? { right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: 12 } : {}),
            ...(position === "top" ? { bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8 } : {}),
          }}
        >
          <SectionPreviewCard kind={section.id} label={section.label} />
        </div>
      )}
    </div>
  );
}
