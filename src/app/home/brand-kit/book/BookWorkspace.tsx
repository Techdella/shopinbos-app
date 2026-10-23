"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Mascot, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import { bookToThemeTokens, type BrandBook } from "@shared/brand-book";

async function readError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return Object.assign(new Error(json?.error?.message ?? fallback), { code: json?.error?.code });
}

const needsCredits = (error: unknown) => isCreditsError((error as { code?: string } | null)?.code);

const SECTIONS = [
  { icon: "palette", key: "book.colours" },
  { icon: "document", key: "book.type" },
  { icon: "chat", key: "book.voice" },
  { icon: "tag", key: "book.marks" },
  { icon: "image", key: "book.photos" },
  { icon: "checkCircle", key: "book.dosDonts" },
] as const;

const STEPS = ["book.step.read", "book.step.colours", "book.step.voice", "book.step.rules"] as const;

/**
 * The style book page around the printable book: a toolbar to make or remake it with Rex (with an optional
 * direction), use its colours and print; a clear error with a retry; and, before there's a book, what it will
 * hold and Rex's progress while he writes.
 */
export function BookWorkspace({
  book,
  updatedLabel,
  children,
}: {
  book: Pick<BrandBook, "colours" | "typography"> | null;
  updatedLabel: string | null;
  children: ReactNode;
}) {
  const t = useT("store");
  const router = useRouter();
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState<null | "make" | "apply">(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; credits?: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const hasBook = Boolean(book);

  useEffect(() => {
    if (busy !== "make") return;
    setStep(0);
    const timer = window.setInterval(() => setStep((value) => Math.min(value + 1, STEPS.length - 1)), 6000);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function make() {
    setBusy("make");
    setNote(null);
    try {
      const response = await fetch("/api/ai/brand-book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction: direction.trim() || undefined }) });
      if (!response.ok) throw await readError(response, t("book.failed"));
      setDirection("");
      setNote({ ok: true, text: t("book.made") });
      router.refresh();
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : t("book.failed"), credits: needsCredits(error) });
    } finally {
      setBusy(null);
      creditsChanged();
    }
  }

  async function apply() {
    if (!book) return;
    setBusy("apply");
    setNote(null);
    try {
      const response = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ op: "update-theme", changes: bookToThemeTokens(book.colours, book.typography.style) }] }),
      });
      if (!response.ok) throw await readError(response, t("book.failed"));
      setNote({ ok: true, text: t("book.applied") });
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : t("book.failed") });
    } finally {
      setBusy(null);
    }
  }

  const directionField = (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-app-line bg-app-canvas py-1 pl-4 pr-1 focus-within:border-app-ink">
      <Icon name="wand" size={15} className="shrink-0 text-app-ink-soft" />
      <label htmlFor="book-direction" className="sr-only">{t("book.direction")}</label>
      <input
        id="book-direction"
        value={direction}
        maxLength={300}
        disabled={busy !== null}
        onChange={(event) => setDirection(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && busy === null) void make();
        }}
        placeholder={t("book.directionPh")}
        className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
      />
      <PillButton size="sm" tone="ink" disabled={busy !== null} onClick={() => void make()} className="shrink-0">
        {busy === "make" ? <Spinner className="h-4 w-4" /> : <Icon name="sparkle" size={14} />}
        <span>{busy === "make" ? t("book.writing") : hasBook ? t("book.remake") : t("book.make")}</span>
      </PillButton>
    </div>
  );

  return (
    <>
      <div className="no-print sticky top-0 z-10 border-b border-app-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-4 py-3 sm:px-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/home/brand-kit" aria-label={t("sheet.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-app-line text-app-ink hover:border-app-line-strong">
              <Icon name="arrowLeft" size={17} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="m-0 truncate text-[18px] font-extrabold leading-tight">{t("book.title")}</h1>
              <p className="m-0 truncate text-[12.5px] text-app-ink-soft">{updatedLabel ? t("book.updated", { date: updatedLabel }) : t("book.sub")}</p>
            </div>
            {hasBook ? (
              <div className="flex flex-wrap items-center gap-2">
                <PillButton size="sm" tone="white" disabled={busy !== null} onClick={() => void apply()}>
                  {busy === "apply" ? <Spinner className="h-4 w-4" /> : <Icon name="palette" size={14} />} <span className="hidden sm:inline">{t("book.apply")}</span><span className="sm:hidden">{t("book.applyShort")}</span>
                </PillButton>
                <PillButton size="sm" tone="white" onClick={() => window.print()}>
                  <Icon name="download" size={14} /> <span className="hidden sm:inline">{t("book.print")}</span><span className="sm:hidden">PDF</span>
                </PillButton>
              </div>
            ) : null}
          </div>
          {hasBook ? directionField : null}
        </div>
      </div>

      {note ? (
        <div className="no-print px-4 pt-4 sm:px-6">
          <div
            role={note.ok ? "status" : "alert"}
            className={cx(
              "mx-auto flex max-w-[210mm] flex-wrap items-start gap-3 rounded-[16px] border px-4 py-3",
              note.ok ? "border-app-success/30 bg-app-success/[0.06]" : "border-app-danger/30 bg-app-danger/[0.06]",
            )}
          >
            <Icon name={note.ok ? "checkCircle" : "warn"} size={18} className={cx("mt-0.5 shrink-0", note.ok ? "text-app-success" : "text-app-danger")} />
            <p className="m-0 min-w-0 flex-1 text-[14px] font-bold leading-[1.45]">{note.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              {!note.ok && !note.credits ? (
                <>
                  <PillButton size="sm" tone="ink" disabled={busy !== null} onClick={() => void make()}>
                    <Icon name="refresh" size={14} /> {t("book.retry")}
                  </PillButton>
                  <Link href={`/studio?prompt=${encodeURIComponent(t("book.chatPrompt"))}`} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                    <Icon name="chat" size={14} /> {t("book.askInChat")}
                  </Link>
                </>
              ) : null}
              {note.credits ? <BuyCreditsButton /> : null}
              <button type="button" aria-label={t("book.dismiss")} onClick={() => setNote(null)} className="grid h-8 w-8 place-items-center rounded-full text-app-ink-soft hover:bg-white">
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-4 py-6 sm:px-6 print:p-0">
        {hasBook ? (
          <div className={cx("transition-opacity", busy === "make" && "pointer-events-none opacity-50")} aria-busy={busy === "make"}>{children}</div>
        ) : busy === "make" ? (
          <article className="mx-auto w-full max-w-[210mm] rounded-[22px] border border-app-line bg-white p-8 sm:p-10" aria-live="polite">
            <div className="flex items-center gap-4">
              <Mascot name="rex" alt="" className="h-14 w-14 shrink-0" />
              <div className="min-w-0">
                <h2 className="m-0 text-[20px] font-extrabold">{t("book.writing")}</h2>
                <p className="m-0 mt-0.5 text-[14px] text-app-ink-soft">{t("book.writingSub")}</p>
              </div>
            </div>
            <ol className="m-0 mt-6 grid list-none gap-2 p-0">
              {STEPS.map((key, index) => (
                <li key={key} className={cx("flex items-center gap-3 rounded-[14px] border px-4 py-3 text-[14px] font-bold", index === step ? "border-app-ink bg-app-canvas" : "border-app-line", index > step && "text-app-ink-soft")}>
                  {index < step ? <Icon name="checkCircle" size={16} className="text-app-success" /> : index === step ? <Spinner className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border-2 border-app-line" aria-hidden />}
                  {t(key)}
                </li>
              ))}
            </ol>
            <div className="mt-6 grid grid-cols-6 gap-2" aria-hidden>
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-[12px] bg-app-canvas" style={{ animationDelay: `${index * 120}ms` }} />)}
            </div>
          </article>
        ) : (
          <article className="mx-auto w-full max-w-[210mm] overflow-hidden rounded-[22px] border border-app-line bg-white">
            <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center sm:px-10">
              <Mascot name="rex" alt="" className="h-16 w-16" />
              <h2 className="m-0 mt-4 text-[24px] font-extrabold">{t("book.emptyTitle")}</h2>
              <p className="mx-auto mb-0 mt-2 max-w-[480px] text-[14.5px] leading-[1.55] text-app-ink-soft">{t("book.emptyBody")}</p>
              <div className="mt-6 w-full max-w-[560px]">{directionField}</div>
            </div>
            <div className="border-t border-app-line bg-app-canvas/60 px-6 py-6 sm:px-10">
              <p className="m-0 mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-app-ink-soft">{t("book.inside")}</p>
              <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
                {SECTIONS.map((section) => (
                  <li key={section.key} className="flex items-center gap-2.5 rounded-[14px] border border-app-line bg-white px-3 py-3 text-[13.5px] font-bold">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={section.icon} size={15} /></span>
                    <span className="min-w-0">{t(section.key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        )}
      </div>
    </>
  );
}
