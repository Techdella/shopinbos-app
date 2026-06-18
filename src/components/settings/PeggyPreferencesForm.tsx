"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { savePeggyPreferences } from "@/app/actions/workspace";

interface PeggyPreferencesFormProps {
  defaultMemory: string;
  defaultCommStyle: string;
  defaultDailyBrief: string;
}

const COMM_STYLES = ["Direct", "Friendly", "Formal"] as const;
const BRIEF_OPTIONS = ["Off", "Morning only", "Full daily"] as const;

export function PeggyPreferencesForm({ defaultMemory, defaultCommStyle, defaultDailyBrief }: PeggyPreferencesFormProps) {
  const [commStyle, setCommStyle] = useState(defaultCommStyle);
  const [dailyBrief, setDailyBrief] = useState(defaultDailyBrief);

  return (
    <form action={savePeggyPreferences} className="card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Peggy memory & preferences</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-600)", lineHeight: 1.5, marginBottom: 14 }}>
        Peggy learns from your store activity. You can review what she knows and adjust how she communicates.
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="label">What should Peggy know about your business?</label>
        <textarea
          name="memory"
          className="ta"
          rows={4}
          defaultValue={defaultMemory}
          placeholder="e.g., We sell handmade leather goods, our busy season is Q4, and we prefer WhatsApp for customer communication..."
          style={{ fontSize: 13.5, lineHeight: 1.5 }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="field">
          <label className="label">Peggy communication style</label>
          <input type="hidden" name="communicationStyle" value={commStyle} />
          <div style={{ display: "flex", gap: 5 }}>
            {COMM_STYLES.map((t) => (
              <button
                key={t}
                type="button"
                className={"chip " + (commStyle === t ? "on" : "")}
                style={{ fontSize: 11.5 }}
                onClick={() => setCommStyle(t)}
              >{t}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="label">Daily brief</label>
          <input type="hidden" name="dailyBrief" value={dailyBrief} />
          <div style={{ display: "flex", gap: 5 }}>
            {BRIEF_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={"chip " + (dailyBrief === t ? "on" : "")}
                style={{ fontSize: 11.5 }}
                onClick={() => setDailyBrief(t)}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>
      <button type="submit" className="dbtn dBtn-mint">
        <Icon name="check" size={14} /> Save memory
      </button>
    </form>
  );
}
