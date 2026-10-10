"use client";

import { useRouter } from "next/navigation";
import { DomainSetup } from "@/components/builder/DomainSetup";

interface DomainSettingsPanelProps {
  storeSlug: string;
  storeName: string;
  currentDomain: string | null;
}

export function DomainSettingsPanel({ storeSlug, storeName, currentDomain }: DomainSettingsPanelProps) {
  const router = useRouter();

  const handleDone = (domain: string | null) => {
    if (domain) {
      router.refresh();
    }
  };

  return (
    <div style={{ maxWidth: 780 }}>
      {currentDomain && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16, background: "var(--teal-50)", borderColor: "var(--teal-200)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--teal-700)", marginBottom: 4 }}>
            Active custom domain
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-900)" }}>
            {currentDomain}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
            Your store is live at <a href={`https://${currentDomain}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal-700)" }}>https://{currentDomain}</a>
          </div>
        </div>
      )}
      <DomainSetup storeSlug={storeSlug} storeName={storeName} onDone={handleDone} />
    </div>
  );
}
