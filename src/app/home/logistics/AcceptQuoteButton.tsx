"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

/** "Book at this price" on a quote the partner has priced: turns it into a booking offered to that partner. */
export function AcceptQuoteButton({ quoteId }: { quoteId: string }) {
  const t = useT("shipping");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/app/logistics/quotes/${encodeURIComponent(quoteId)}/accept`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error?.message ?? t("qf.bookFailed"));
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-1.5 grid justify-items-end gap-1">
      <PillButton tone="ink" size="sm" busy={busy} onClick={() => void accept()}>{t("qf.bookAtPrice")}</PillButton>
      {error && <span role="alert" className="max-w-[200px] text-right text-[12.5px] text-app-danger">{error}</span>}
    </div>
  );
}
