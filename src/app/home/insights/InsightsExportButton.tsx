"use client";

import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";

export function InsightsExportButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("white")}>
      <Icon name="download" size={16} />
      Save as PDF
    </button>
  );
}
