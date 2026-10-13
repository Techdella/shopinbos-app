"use client";

import { useState, useTransition } from "react";
import { setDropshipPaused } from "@/app/actions/dropship";
import { useT } from "@/components/i18n/I18nProvider";

/** Pause / Sell again on a dropship card. */
export function PauseButton({ relationshipId, paused, name }: { relationshipId: string; paused: boolean; name: string }) {
  const t = useT("marketplace");
  const [isPaused, setPaused] = useState(paused);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setDropshipPaused({ relationshipId, pause: !isPaused });
            if (result.ok) setPaused(result.status === "paused");
            else setError(result.error);
          })
        }
        aria-label={`${isPaused ? t("ds.sellAgain") : t("ds.pause")}: ${name}`}
        className="inline-flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-full border border-app-line bg-white px-3 text-[13.5px] font-extrabold text-app-ink hover:border-app-line-strong disabled:opacity-60"
      >
        {pending ? t("ds.saving") : isPaused ? t("ds.sellAgain") : t("ds.pause")}
      </button>
      {error && <p role="alert" className="m-0 w-full text-[12.5px] font-bold text-app-danger">{error}</p>}
    </>
  );
}
