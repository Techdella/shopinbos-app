import type { ReactNode } from "react";

interface FilterBarProps {
  search?: string;
  selects?: string[];
  right?: ReactNode;
  searchPlaceholder?: string;
}

export function FilterBar({ search, selects, right, searchPlaceholder }: FilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 14,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {search !== undefined && (
        <div className="sb-search" style={{ flex: "1 1 240px", maxWidth: 380 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
          <span style={{ color: "var(--ink-400)" }}>{search}</span>
        </div>
      )}
      {selects?.map((s, i) => (
        <div key={i} className="sel" style={{ minWidth: 140, fontSize: 12.5, padding: "7px 11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--ink-500)" }}>{s}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      ))}
      {right && <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{right}</div>}
    </div>
  );
}
