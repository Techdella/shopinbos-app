"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";

// Where Supabase's change-email links land (My details › Email, src/lib/my-details.server.ts). Supabase has already
// done the work when this opens; the fragment only says how it went: an error (the link expired or was used), a
// message (secure email change: one address confirmed, open the link sent to the other one too) or, with neither,
// done. The fragment can hold a session token, so it's dropped from the address bar at once and never used.

type Outcome = "checking" | "done" | "half" | "failed";

export default function EmailChangedPage() {
  const t = useT("details");
  const [outcome, setOutcome] = useState<Outcome>("checking");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", window.location.pathname);
    const next: Outcome = hash.get("error") || hash.get("error_description") || query.get("error") ? "failed" : hash.get("message") ? "half" : "done";
    // Set from the URL once, after the first paint (the server can't see the fragment).
    setOutcome(next);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-app-canvas px-6 font-app text-app-ink">
      <div className="max-w-[420px] rounded-[24px] border border-app-line bg-white p-7 text-center">
        <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]" role="status">
          {outcome === "checking" ? "…" : t(`emailLink.${outcome}.title`)}
        </h1>
        {outcome !== "checking" ? <p className="mb-0 mt-2 text-[15px] leading-[1.5] text-app-ink-soft">{t(`emailLink.${outcome}.body`)}</p> : null}
        <Link href="/login" className="mt-5 inline-flex h-11 items-center rounded-full bg-app-ink px-5 text-[14.5px] font-extrabold text-white no-underline">
          {t("emailLink.open")}
        </Link>
      </div>
    </main>
  );
}
