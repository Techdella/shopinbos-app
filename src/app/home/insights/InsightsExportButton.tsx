"use client";

import { Icon } from "@/components/ui";

export function InsightsExportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn dBtn-ghost"
      style={{ fontSize: 12.5, padding: "7px 13px", display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <Icon name="download" size={14} />
      Export PDF
    </button>
  );
}
