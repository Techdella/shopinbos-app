"use client";

import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

interface VerificationProgressProps {
  steps: { label: string; done: boolean }[];
}

export function VerificationProgress({ steps }: VerificationProgressProps) {
  const t = useT("verification");
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / Math.max(steps.length, 1)) * 100);

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 12,
        background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
        border: "1px solid #86EFAC50",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t("progress.title")}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "#BBF7D0", borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--success)", borderRadius: 999 }} />
      </div>
      {steps.map((step) => (
        <div
          key={step.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0",
            fontSize: 12.5,
            color: step.done ? "var(--success)" : "var(--ink-400)",
          }}
        >
          <Icon name={step.done ? "check" : "clock"} size={14} />
          <span style={{ fontWeight: step.done ? 600 : 400 }}>{step.label}</span>
          {step.done && <span style={{ fontSize: 10, color: "var(--success)", marginLeft: "auto" }}>✓</span>}
        </div>
      ))}
    </div>
  );
}
