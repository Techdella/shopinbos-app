"use client";

import { useState } from "react";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// "Notify me when they add products" on a supplier's products page: follows the supplier, and the supplier hears a
// shop is waiting (POST /api/app/suppliers/<slug>/notify-me; src/lib/suppliers/product-requests.server.ts).

export function NotifyMeButton({ supplierSlug, supplierName, following: initial, hasProducts, tone = "orange" }: { supplierSlug: string; supplierName: string; following: boolean; hasProducts: boolean; tone?: "orange" | "white" }) {
  const t = useT("marketplace");
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/app/suppliers/${encodeURIComponent(supplierSlug)}/notify-me`, { method: following ? "DELETE" : "POST", headers: { Accept: "application/json" } });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? t("waitlist.failed"));
      setFollowing(!following);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setBusy(false);
    }
  }

  if (following) {
    return (
      <div className="grid gap-1.5">
        <p className="m-0 flex items-start gap-2 rounded-[14px] bg-app-mint px-3.5 py-2.5 text-[14px] font-bold text-app-ink" role="status">
          <Icon name="checkCircle" size={17} className="mt-0.5 shrink-0" />
          {t("waitlist.on", { name: supplierName })}
        </p>
        <button type="button" disabled={busy} onClick={() => void toggle()} className="justify-self-start text-[13px] font-bold text-app-ink-soft underline underline-offset-2 disabled:opacity-55">
          {t("waitlist.stop")}
        </button>
        {error && <p role="alert" className="m-0 text-[13px] text-app-danger">{error}</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <PillButton tone={tone} size="md" busy={busy} onClick={() => void toggle()} data-testid="notify-me">
        <Icon name="bell" size={16} /> {hasProducts ? t("waitlist.joinMore") : t("waitlist.join")}
      </PillButton>
      {error && <p role="alert" className="m-0 text-[13px] text-app-danger">{error}</p>}
    </div>
  );
}
