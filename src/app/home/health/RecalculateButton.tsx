"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

export function RecalculateButton({ label = "Work it out again", tone = "white" }: { label?: string; tone?: "white" | "ink" }) {
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
      setError("Couldn't work out your score. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <PillButton size="md" tone={tone} busy={busy} onClick={() => void run()}>
        <Icon name="refresh" size={16} /> {label}
      </PillButton>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
