"use client";

import type { TrustScoreBreakdownItem } from "@/lib/verification-utils";

interface TrustScoreBreakdownProps {
  items: TrustScoreBreakdownItem[];
  total: number;
  level: string;
  nextLevel: string;
  nextLevelAt: number;
}

const levelColors: Record<string, string> = {
  "Platinum Verified": "#8B5CF6",
  "Gold Verified": "#F59E0B",
  "Silver Verified": "#94A3B8",
  "Bronze Verified": "#D97706",
};

export function TrustScoreBreakdown({ items, total, level, nextLevel, nextLevelAt }: TrustScoreBreakdownProps) {
  const levelColor = levelColors[level] ?? "#9CA3AF";
  const nextColor = levelColors[nextLevel] ?? "#9CA3AF";

  return (
    <div>
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${levelColor}15, ${levelColor}08)`,
          border: `1px solid ${levelColor}30`,
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700, color: levelColor }}>{total}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: levelColor }}>/ 100 — {level}</div>
        {nextLevelAt && total < nextLevelAt && (
          <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 4 }}>
            {nextLevelAt - total} more points to reach {nextLevel}
          </div>
        )}
        <div style={{ height: 6, background: "#E5E7EB", borderRadius: 999, marginTop: 10, overflow: "hidden" }}>
          <div style={{ width: `${total}%`, height: "100%", background: levelColor, borderRadius: 999, transition: "width 0.5s" }} />
        </div>
      </div>

      {items.map((item, i) => {
        const isNegative = item.score < 0;
        const pct = item.maxScore > 0 ? Math.round((Math.abs(item.score) / item.maxScore) * 100) : 0;

        return (
          <div key={item.label} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--ink-100)" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: "var(--ink-600)" }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: isNegative ? "var(--danger)" : "var(--teal-700)" }}>
                {isNegative ? item.score : `+${item.score}`}
              </span>
            </div>
            {!isNegative && item.maxScore > 0 && (
              <div style={{ height: 4, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: item.score > 0 ? levelColor : "#E5E7EB", borderRadius: 999 }} />
              </div>
            )}
            <div style={{ fontSize: 10.5, color: "var(--ink-400)", marginTop: 2 }}>{item.details}</div>
          </div>
        );
      })}
    </div>
  );
}
