"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx, Mascot, Notice, PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { BUILD_STEPS, stepName } from "@shared/seller-onboarding";

// The guided build's one layout on the web (design RB-02…RB-15, adapted from the phone's rex-build/Frame.tsx): a
// header with back (or ✕ on the first screens), "Step 2 of 5 · Style", Save & exit, and the 5-part bar; Rex's chat
// head with one question in a centred column (~560px; visual grids get a wider one on a computer); and a sticky
// footer with the main button and "✨ Let Rex choose for me". Rex's pick flashes "✓ Rex chose: …" for a second, then
// the screen moves on (the screen does that: onRexChoose). Works the same at phone width.

export function RexHead({ size = 48 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-app-forest bg-app-mint" style={{ width: size, height: size }}>
      <Mascot name="rex" alt="" className="h-[86%] w-[86%]" />
    </span>
  );
}

/** Rex's question: his face, then a white bubble with the question (and one line under it). */
export function RexSays({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <RexHead />
      <div className="min-w-0 flex-1 rounded-[22px] rounded-tl-[8px] border border-app-line bg-white px-4 py-3.5 sm:px-5">
        <h1 className="m-0 text-[22px] font-extrabold leading-[1.15] tracking-[-0.4px] sm:text-[26px]">{title}</h1>
        {sub ? <p className="m-0 mt-1 text-[15.5px] leading-[1.45] text-app-ink">{sub}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** The 5-part bar: steps done in green, the current one orange. `current` 0 shows the plan (first part orange). */
export function StepBar({ current, total = BUILD_STEPS.length, label }: { current: number; total?: number; label?: string }) {
  const at = Math.max(1, current);
  return (
    <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={at} aria-label={label}>
      {Array.from({ length: total }, (_, index) => {
        const step = index + 1;
        return <span key={index} className={cx("h-[5px] flex-1 rounded-full transition", step < at ? "bg-app-success" : step === at ? "bg-app-accent" : "bg-app-track")} />;
      })}
    </div>
  );
}

export interface FrameButton {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
  testId?: string;
}

export interface FrameProps {
  /** 1-5: "Step X of 5 · Name"; 0: the plan ("Build with Rex"); null: shop basics (small "2 of 3"). */
  step: number | null;
  basics?: { current: number; total: number };
  children: ReactNode;
  /** ✕ instead of the back arrow (the first screens of the build). */
  close?: boolean;
  onBack: () => void;
  onSave?: (() => void) | null;
  primary?: FrameButton | null;
  /** A second button beside the main one ("Show me another"). */
  secondary?: FrameButton | null;
  /** "✨ Let Rex choose for me" (or another link under the button: "I'll add more later", "Rewrite it"). */
  link?: { title: string; onPress: () => void; icon?: IconName; testId?: string } | null;
  onRexChoose?: (() => void) | null;
  /** "✓ Rex chose: Soft and calm", shown for a second before the next screen. */
  flash?: string | null;
  error?: string | null;
  /** "Welcome back, Ada…" on the screen the seller reopened on. */
  notice?: string | null;
  footerExtra?: ReactNode;
  /** Visual choice grids: a wider column on a computer. */
  wide?: boolean;
  /** The review's full-width preview. */
  full?: boolean;
}

export function RexFrame({ step, basics, children, close, onBack, onSave, primary, secondary, link, onRexChoose, flash, error, notice, footerExtra, wide, full }: FrameProps) {
  const t = useT("rexBuild", "common");
  const title = step === null ? (basics ? t("frame.basics", basics) : "") : step === 0 ? t("frame.build") : t("frame.step", { current: step, total: BUILD_STEPS.length, name: t.dynamic(`step.${stepName(step)}`, stepName(step)) });
  const chooser = onRexChoose ? { title: t("frame.rexChoose"), onPress: onRexChoose, icon: "sparkle" as IconName, testId: "rex-choose" } : null;
  const under = link ?? chooser;
  const column = full ? "max-w-[1180px]" : wide ? "max-w-[560px] lg:max-w-[880px]" : "max-w-[560px]";

  return (
    <div className="flex min-h-dvh flex-col bg-app-canvas font-app text-app-ink">
      <header className="sticky top-0 z-20 border-b border-app-line bg-app-canvas/95 backdrop-blur">
        <div className={cx("mx-auto flex w-full items-center gap-2 px-4 pt-2 sm:px-6", full ? "max-w-[1180px]" : "max-w-[880px]")}>
          <button type="button" onClick={onBack} aria-label={close ? t("frame.close") : t("frame.back")} data-testid="rex-back" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-app-ink hover:bg-black/[0.04]">
            <Icon name={close ? "x" : "arrowLeft"} size={22} />
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-app-ink-soft">{title}</div>
          {onSave ? (
            <button type="button" onClick={onSave} data-testid="rex-save" className="min-h-[44px] shrink-0 rounded-full px-3 text-[14.5px] font-bold text-app-ink-soft hover:bg-black/[0.04] hover:text-app-ink">
              {t("frame.saveExit")}
            </button>
          ) : (
            <span className="w-11 shrink-0" />
          )}
        </div>
        <div className={cx("mx-auto w-full px-4 pb-3 pt-2 sm:px-6", full ? "max-w-[1180px]" : "max-w-[880px]")}>
          {step !== null ? <StepBar current={step} label={title} /> : basics ? <StepBar current={basics.current} total={basics.total} label={title} /> : null}
        </div>
      </header>

      <main className={cx("mx-auto flex w-full flex-1 flex-col gap-5 px-4 pb-8 pt-6 sm:px-6", column)}>
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {children}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-app-line bg-app-canvas/95 backdrop-blur">
        <div className={cx("mx-auto flex w-full flex-col gap-2 px-4 pb-4 pt-3 sm:px-6", full ? "max-w-[1180px]" : "max-w-[560px]")}>
          {flash ? (
            <div role="status" className="mb-1 inline-flex items-center gap-2 self-center rounded-full bg-app-forest px-4 py-2.5 text-[15px] font-bold text-white">
              <Icon name="check" size={16} strokeWidth={2.6} />
              {t("frame.rexChose", { choice: flash })}
            </div>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          {footerExtra}
          {secondary || primary ? (
            <div className="flex gap-2.5">
              {secondary ? (
                <PillButton tone="white" className="flex-1" disabled={secondary.disabled || Boolean(flash)} busy={secondary.busy} onClick={secondary.onPress} data-testid={secondary.testId}>
                  {secondary.icon ? <Icon name={secondary.icon} size={18} /> : null}
                  {secondary.title}
                </PillButton>
              ) : null}
              {primary ? (
                <PillButton tone="orange" className="flex-1" disabled={primary.disabled || Boolean(flash)} busy={primary.busy} onClick={primary.onPress} data-testid={primary.testId ?? "rex-primary"}>
                  {primary.icon ? <Icon name={primary.icon} size={18} /> : null}
                  {primary.title}
                </PillButton>
              ) : null}
            </div>
          ) : null}
          {under ? (
            <button type="button" onClick={under.onPress} disabled={Boolean(flash)} data-testid={under.testId} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-center rounded-full px-4 text-[16px] font-bold text-app-forest hover:bg-app-mint disabled:opacity-55">
              <Icon name={under.icon ?? "sparkle"} size={17} />
              {under.title}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
