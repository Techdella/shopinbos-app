"use client";

import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";

export default function TaxesPage() {
  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Taxes" sub="Configure tax rates for your store" />

        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Icon name="percent" size={32} />
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-700)", marginTop: 12 }}>Tax configuration coming soon</div>
          <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6, maxWidth: 480, marginInline: "auto", lineHeight: 1.6 }}>
            Tax automation is in development. For now, prices are shown inclusive of applicable taxes. You can reach out to support for manual tax configuration.
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
