"use client";

import { useState } from "react";
import { Notice, PillButton } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

// The guarantor types the code from the text, then confirms or declines (POST /api/public/guarantor/<token>).
export function GuarantorAnswer({ token, partner }: { token: string; partner: string }) {
  const t = useT("partnerKyc");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"confirmed" | "declined" | null>(null);

  async function answer(decision: "confirm" | "decline") {
    setBusy(decision);
    setError("");
    const response = await fetch(`/api/public/guarantor/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, decision }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { data?: { status?: "confirmed" | "declined" }; error?: { message?: string } } | null;
    setBusy(null);
    if (response?.ok && body?.data?.status) setDone(body.data.status);
    else setError(body?.error?.message ?? t("page.failed"));
  }

  if (done) return <Notice tone="success">{done === "confirmed" ? t("gpage.confirmed", { partner }) : t("gpage.declined", { partner })}</Notice>;
  return (
    <div className="grid gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      <label className="block">
        <span className={field.label}>{t("gpage.codeLabel")}</span>
        <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={`${field.input} tracking-[0.3em]`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <PillButton size="md" busy={busy === "confirm"} disabled={code.length !== 6 || busy !== null} onClick={() => void answer("confirm")}>{t("gpage.confirm")}</PillButton>
        <PillButton tone="white" size="md" busy={busy === "decline"} disabled={code.length !== 6 || busy !== null} onClick={() => void answer("decline")}>{t("gpage.decline")}</PillButton>
      </div>
    </div>
  );
}
