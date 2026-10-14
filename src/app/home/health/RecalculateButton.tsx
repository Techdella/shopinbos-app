"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

export function RecalculateButton({ label, tone = "white" }: { label?: string; tone?: "white" | "ink" }) {
  const t = useT("home");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/health-score", { method: "POST" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(t("health.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <PillButton size="md" tone={tone} busy={busy} onClick={() => void run()}>
        <Icon name="refresh" size={16} /> {label ?? t("health.again")}
      </PillButton>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
