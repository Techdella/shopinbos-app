import type { ReactNode } from "react";

type DeltaDir = "up" | "down" | "flat";

interface StatTileProps {
  label: string;
  value: string;
  delta?: string;
  deltaDir?: DeltaDir;
  icon?: ReactNode | string;
  iconBg?: string;
  money?: boolean;
}

export function StatTile({ label, value, delta, deltaDir = "flat", icon, iconBg, money }: StatTileProps) {
  const deltaCls = deltaDir === "up" ? "delta-up" : deltaDir === "down" ? "delta-down" : "delta-flat";
  return (
    <div className="stat" style={iconBg ? { position: "relative" } : undefined}>
      <div className="stat-lbl">{label}</div>
      <div className={`stat-val${money ? " money" : ""}`}>{value}</div>
      {delta && (
        <div className={`stat-delta ${deltaCls}`}>
          {deltaDir === "up" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l5-5 5 5"/><path d="M7 7l5 5 5-5"/></svg>}
          {deltaDir === "down" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 7l-5 5-5-5"/><path d="M17 17l-5-5-5 5"/></svg>}
          {delta}
        </div>
      )}
    </div>
  );
}
