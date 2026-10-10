import type { ReactNode } from "react";

interface Tab {
  label: string;
  active?: boolean;
  count?: number;
}

interface DesignTabsProps {
  tabs: Tab[];
  onChange?: (index: number) => void;
}

export function DesignTabs({ tabs, onChange }: DesignTabsProps) {
  return (
    <div className="design-tabs">
      {tabs.map((t, i) => (
        <button
          key={i}
          className={`tab${t.active ? " on" : ""}`}
          onClick={() => onChange?.(i)}
        >
          {t.label}
          {t.count !== undefined && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 4, opacity: 0.7 }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
