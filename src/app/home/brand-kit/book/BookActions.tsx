"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import { bookToThemeTokens, type BrandBook } from "@shared/brand-book";
import { friendlyError } from "@/lib/errors/report-client";

async function readError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return Object.assign(new Error(json?.error?.message ?? fallback), { code: json?.error?.code });
}

const needsCredits = (error: unknown) => isCreditsError((error as { code?: string } | null)?.code);

/** Style book toolbar: make or remake it with Rex (with an optional direction), use its colours, print. */
export function BookActions({ hasBook, colours, headingStyle }: { hasBook: boolean; colours: BrandBook["colours"] | null; headingStyle: "serif" | "grotesk" | null }) {
  const t = useT("store");
  const router = useRouter();
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState<null | "make" | "apply">(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; credits?: boolean } | null>(null);

  async function make() {
    setBusy("make");
    setNote(null);
    try {
      const response = await fetch("/api/ai/brand-book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction: direction.trim() || undefined }) });
      if (!response.ok) throw await readError(response, t("book.failed"));
      setDirection("");
      router.refresh();
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? friendlyError(error) : t("book.failed"), credits: needsCredits(error) });
    } finally {
      setBusy(null);
      creditsChanged();
    }
  }

  async function apply() {
    if (!colours) return;
    setBusy("apply");
    setNote(null);
    try {
      const response = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ op: "update-theme", changes: bookToThemeTokens(colours, headingStyle ?? undefined) }] }),
      });
      if (!response.ok) throw await readError(response, t("book.failed"));
      setNote({ ok: true, text: t("book.applied") });
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? friendlyError(error) : t("book.failed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      <label htmlFor="book-direction" className="sr-only">{t("book.direction")}</label>
      <input
        id="book-direction"
        value={direction}
        maxLength={300}
        onChange={(event) => setDirection(event.target.value)}
        placeholder={t("book.directionPh")}
        className="h-10 min-w-0 flex-1 basis-[220px] rounded-full border border-app-line bg-app-canvas px-4 text-[13.5px] outline-none focus:border-app-ink"
      />
      <PillButton size="sm" tone={hasBook ? "white" : "ink"} disabled={busy !== null} onClick={() => void make()}>
        {busy === "make" ? <><Spinner className="h-4 w-4" /> {t("book.writing")}</> : <><Icon name="sparkle" size={14} /> {hasBook ? t("book.remake") : t("book.make")}</>}
      </PillButton>
      {hasBook ? (
        <>
          <PillButton size="sm" tone="white" disabled={busy !== null} onClick={() => void apply()}>
            {busy === "apply" ? <Spinner className="h-4 w-4" /> : <Icon name="palette" size={14} />} {t("book.apply")}
          </PillButton>
          <PillButton size="sm" tone="ink" onClick={() => window.print()}>
            <Icon name="download" size={14} /> {t("book.print")}
          </PillButton>
        </>
      ) : null}
      {note ? <p role="status" className={note.ok ? "m-0 w-full text-right text-[13px] font-bold text-app-success" : "m-0 w-full text-right text-[13px] font-bold text-app-danger"}>{note.text}</p> : null}
      {note?.credits ? <BuyCreditsButton /> : null}
    </div>
  );
}
