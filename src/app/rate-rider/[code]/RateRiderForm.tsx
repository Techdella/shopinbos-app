"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

export function RateRiderForm({ code, rated }: { code: string; rated: number | null }) {
  const t = useT("rider");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">(rated ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return <p className="mt-6 rounded-lg bg-cream px-4 py-3 text-[15px] text-navy">{t("review.thanks")}</p>;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rating) return setError(t("review.pick"));
    setState("saving");
    setError(null);
    const response = await fetch("/api/public/rider-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, rating, comment }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response?.ok) {
      setState("idle");
      return setError(body?.error?.message ?? t("review.failed"));
    }
    setState("done");
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="flex gap-2" role="radiogroup" aria-label={t("review.stars")}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={t("review.starLabel", { count: value })}
            onClick={() => setRating(value)}
            className={`h-12 w-12 rounded-pill text-[24px] ${value <= rating ? "bg-amber/20 text-amber" : "bg-cream text-navy/25"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={500}
        rows={3}
        placeholder={t("review.comment")}
        className="w-full rounded-lg border border-navy/10 px-3 py-2 text-[15px]"
      />
      {error ? <p className="text-[14px] text-coral">{error}</p> : null}
      <button type="submit" disabled={state === "saving"} className="w-full rounded-pill bg-navy px-5 py-3 font-medium text-cream disabled:opacity-60">
        {state === "saving" ? t("review.sending") : t("review.send")}
      </button>
    </form>
  );
}
