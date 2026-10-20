"use client";

import { useEffect, useRef, useState } from "react";
import { Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyCreditsButton } from "@/components/credits/CreditsBadge";
import { THEME_LIBRARY, themeLibraryEntry } from "@/lib/store-templates/theme-library";
import { MAX_INSPIRATION_IMAGES, MAX_INSPIRATION_LINKS, type Inspiration, type InspirationLink } from "@/lib/ai/rex/inspiration";
import type { BuildMode, BuildPlan } from "@/lib/ai/rex/build-plan";
import { getBuildPlans, readInspiration, uploadStudioPhoto, type BuildPlans } from "./api";

// "Build my store": three short steps before Rex starts. 1) the business in a sentence, 2) inspiration (stores the
// seller likes, screenshots, a ready-made theme, a note), 3) how much Rex does, priced against today's free
// allowance and the seller's AI credits. Nothing is spent until "Start building".

export interface BuildSetup {
  brief: string;
  inspiration: Inspiration;
  mode: BuildMode;
  plan: BuildPlan;
}

const STEPS = ["business", "inspiration", "build"] as const;

export function RexBuildSetup({ initialBrief, initialScreenshots = [], initialLinks = [], initialNote = "", currentThemeId, rebuilding, onStart, onClose }: {
  initialBrief: string;
  /** Photos the seller sent with a typed "build my store". */
  initialScreenshots?: string[];
  /** Links typed with it; Rex reads them when the setup opens. */
  initialLinks?: string[];
  initialNote?: string;
  /** The theme the draft is on now (marked "current" in the picker). */
  currentThemeId: string | null;
  /** The store already has a design: say Rex redoes it. */
  rebuilding: boolean;
  onStart: (setup: BuildSetup) => void;
  onClose: () => void;
}) {
  const t = useT("builder", "common");
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState(initialBrief);
  const [links, setLinks] = useState<InspirationLink[]>([]);
  const [linkText, setLinkText] = useState("");
  const [reading, setReading] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>(initialScreenshots.slice(0, MAX_INSPIRATION_IMAGES));
  const [uploading, setUploading] = useState(false);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [note, setNote] = useState(initialNote.slice(0, 1200));
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<BuildPlans | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [mode, setMode] = useState<BuildMode>("full");
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The prices are read when the last step opens (the allowance may have moved since the dialog opened).
  useEffect(() => {
    if (STEPS[step] !== "build") return;
    let live = true;
    setPlans(null);
    setPlansError(null);
    getBuildPlans()
      .then((next) => {
        if (!live) return;
        setPlans(next);
        if (!next.full.canBuild && next.quick.canBuild) setMode("quick");
      })
      .catch((cause) => live && setPlansError(cause instanceof Error ? cause.message : t("rex.bs.planFailed")));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read only when the step changes
  }, [step]);

  async function addLink(raw = linkText) {
    const url = raw.trim();
    if (!url) return;
    if (links.length >= MAX_INSPIRATION_LINKS) {
      setError(t("rex.bs.linksMax", { max: MAX_INSPIRATION_LINKS }));
      return;
    }
    setReading(true);
    setError(null);
    try {
      const link = await readInspiration(url);
      setLinks((current) => (current.some((entry) => entry.url === link.url) || current.length >= MAX_INSPIRATION_LINKS ? current : [...current, link]));
      if (raw === linkText) setLinkText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("rex.bs.linkFailed"));
      if (raw !== linkText) setLinkText(raw);
    } finally {
      setReading(false);
    }
  }

  // Links the seller typed with "build my store" are read straight away.
  useEffect(() => {
    for (const url of initialLinks.slice(0, MAX_INSPIRATION_LINKS)) void addLink(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  async function addScreenshots(files: FileList | null) {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, MAX_INSPIRATION_IMAGES - screenshots.length);
    if (!list.length) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of list) urls.push(await uploadStudioPhoto(file));
      setScreenshots((current) => [...current, ...urls].slice(0, MAX_INSPIRATION_IMAGES));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("rex.bs.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const plan = plans ? plans[mode] : null;
  const canStart = Boolean(plan?.canBuild) && brief.trim().length > 0;
  const current = STEPS[step];

  function start() {
    if (!plan || !canStart) return;
    onStart({ brief: brief.trim(), inspiration: { links, screenshots, themeId, note: note.trim() }, mode, plan });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="rex-build-title">
      <button type="button" aria-label={t("close")} className="absolute inset-0 bg-app-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[100dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_24px_70px_rgba(22,20,31,0.28)] sm:max-h-[min(860px,calc(100dvh-32px))] sm:rounded-[24px]">
        <div className="shrink-0 border-b border-app-line px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="rex-build-title" ref={titleRef} tabIndex={-1} className="m-0 text-[20px] font-extrabold leading-tight outline-none">
                {rebuilding ? t("rex.bs.titleAgain") : t("rex.bs.title")}
              </h2>
              <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-app-ink-soft">{t("rex.bs.sub")}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t("close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
              <Icon name="x" size={18} />
            </button>
          </div>
          <ol className="m-0 mt-4 flex list-none gap-2 p-0" aria-label={t("rex.bs.steps")}>
            {STEPS.map((key, index) => (
              <li key={key} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => index < step && setStep(index)}
                  disabled={index > step}
                  aria-current={index === step ? "step" : undefined}
                  className="w-full text-left disabled:cursor-default"
                >
                  <span className={cx("block h-1.5 rounded-full", index <= step ? "bg-app-ink" : "bg-app-track")} />
                  <span className={cx("mt-1.5 block truncate text-[12px] font-bold", index === step ? "text-app-ink" : "text-app-ink-faint")}>
                    {index + 1}. {t.dynamic(`rex.bs.step.${key}`, key)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {current === "business" ? (
            <div>
              <label htmlFor="rex-build-brief" className="block text-[15px] font-extrabold">{t("rex.bs.briefLabel")}</label>
              <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("rex.bs.briefHint")}</p>
              <textarea
                id="rex-build-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value.slice(0, 2000))}
                rows={5}
                placeholder={t("rex.bs.briefPlaceholder")}
                className="mt-3 w-full resize-y rounded-[16px] border border-app-line px-4 py-3 text-[15px] leading-[1.5] outline-none focus:border-app-ink"
              />
            </div>
          ) : null}

          {current === "inspiration" ? (
            <div className="grid gap-6">
              <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("rex.bs.inspoIntro")}</p>

              <section aria-labelledby="rex-inspo-link">
                <h3 id="rex-inspo-link" className="m-0 flex items-center gap-2 text-[15px] font-extrabold"><Icon name="link" size={16} /> {t("rex.bs.linkTitle")}</h3>
                <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("rex.bs.linkHint")}</p>
                <form
                  noValidate
                  className="mt-3 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!reading) void addLink();
                  }}
                >
                  <input
                    type="url"
                    inputMode="url"
                    value={linkText}
                    onChange={(event) => setLinkText(event.target.value)}
                    placeholder="https://"
                    aria-label={t("rex.bs.linkTitle")}
                    className="min-h-[48px] min-w-0 flex-1 rounded-full border border-app-line px-4 text-[15px] outline-none focus:border-app-ink"
                  />
                  <PillButton type="submit" size="md" busy={reading} disabled={!linkText.trim() || links.length >= MAX_INSPIRATION_LINKS}>{t("rex.bs.add")}</PillButton>
                </form>
                {links.length ? (
                  <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                    {links.map((link) => (
                      <li key={link.url} className="flex items-center gap-3 rounded-[16px] border border-app-line p-3">
                        {link.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={link.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-app-canvas"><Icon name="globe" size={18} /></span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-extrabold">{link.title || link.host}</span>
                          <span className="block truncate text-[12.5px] text-app-ink-soft">{link.host}</span>
                          {link.colours.length ? (
                            <span className="mt-1 flex gap-1" aria-label={t("rex.bs.coloursSeen")}>
                              {link.colours.map((colour) => <span key={colour} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: colour }} />)}
                            </span>
                          ) : null}
                        </span>
                        <button type="button" onClick={() => setLinks((current) => current.filter((entry) => entry.url !== link.url))} aria-label={t("rex.bs.remove", { name: link.host })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
                          <Icon name="x" size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section aria-labelledby="rex-inspo-shots">
                <h3 id="rex-inspo-shots" className="m-0 flex items-center gap-2 text-[15px] font-extrabold"><Icon name="image" size={16} /> {t("rex.bs.shotsTitle")}</h3>
                <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("rex.bs.shotsHint", { max: MAX_INSPIRATION_IMAGES })}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {screenshots.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-20 w-20 rounded-[12px] border border-app-line object-cover" />
                      <button type="button" onClick={() => setScreenshots((current) => current.filter((entry) => entry !== url))} aria-label={t("rex.bs.removeShot")} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-app-ink text-white">
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                  {screenshots.length < MAX_INSPIRATION_IMAGES ? (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="grid h-20 w-20 place-items-center rounded-[12px] border border-dashed border-app-line-strong text-app-ink-soft hover:border-app-ink hover:text-app-ink disabled:opacity-60"
                    >
                      {uploading ? <Spinner className="h-5 w-5" /> : <span className="grid place-items-center gap-1 text-[12px] font-bold"><Icon name="plus" size={18} />{t("rex.bs.addShot")}</span>}
                    </button>
                  ) : null}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => void addScreenshots(event.target.files)} />
                </div>
              </section>

              <section aria-labelledby="rex-inspo-theme">
                <h3 id="rex-inspo-theme" className="m-0 flex items-center gap-2 text-[15px] font-extrabold"><Icon name="layers" size={16} /> {t("rex.bs.themeTitle")}</h3>
                <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("rex.bs.themeHint")}</p>
                <div role="radiogroup" aria-labelledby="rex-inspo-theme" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={themeId === null}
                    onClick={() => setThemeId(null)}
                    className={cx("flex min-h-[92px] flex-col justify-between rounded-[16px] border-2 p-3 text-left", themeId === null ? "border-app-ink" : "border-app-line hover:border-app-line-strong")}
                  >
                    <Icon name="sparkle" size={18} />
                    <span>
                      <span className="block text-[14px] font-extrabold">{t("rex.bs.themeAuto")}</span>
                      <span className="block text-[12px] leading-[1.35] text-app-ink-soft">{t("rex.bs.themeAutoHint")}</span>
                    </span>
                  </button>
                  {THEME_LIBRARY.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={themeId === theme.id}
                      onClick={() => setThemeId(theme.id)}
                      className={cx("flex min-h-[92px] flex-col justify-between rounded-[16px] border-2 p-3 text-left", themeId === theme.id ? "border-app-ink" : "border-app-line hover:border-app-line-strong")}
                      style={{ background: theme.preview.bg, color: theme.preview.ink }}
                    >
                      <span className="flex items-center gap-1" aria-hidden>
                        <span className="h-3 w-3 rounded-full" style={{ background: theme.preview.accent }} />
                        <span className="h-3 w-3 rounded-full border" style={{ background: theme.preview.ink, borderColor: theme.preview.line }} />
                        {theme.id === currentThemeId ? <span className="ml-auto rounded-full bg-black/10 px-2 text-[10.5px] font-bold">{t("rex.bs.current")}</span> : null}
                      </span>
                      <span>
                        <span className="block text-[14px] font-extrabold">{theme.name}</span>
                        <span className="block text-[12px] leading-[1.35] opacity-75">{theme.blurb}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label htmlFor="rex-inspo-note" className="flex items-center gap-2 text-[15px] font-extrabold"><Icon name="chat" size={16} /> {t("rex.bs.noteTitle")}</label>
                <input
                  id="rex-inspo-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 1200))}
                  placeholder={t("rex.bs.notePlaceholder")}
                  className="mt-3 min-h-[48px] w-full rounded-full border border-app-line px-4 text-[15px] outline-none focus:border-app-ink"
                />
              </section>
            </div>
          ) : null}

          {current === "build" ? (
            <div>
              <p className="m-0 text-[15px] font-extrabold">{t("rex.bs.howMuch")}</p>
              {plansError ? <div className="mt-3"><Notice>{plansError}</Notice></div> : null}
              {!plans && !plansError ? (
                <p className="m-0 mt-4 flex items-center gap-2 text-[14px] text-app-ink-soft"><Spinner className="h-4 w-4" /> {t("rex.bs.checking")}</p>
              ) : null}
              {plans ? (
                <>
                  <div role="radiogroup" aria-label={t("rex.bs.howMuch")} className="mt-3 grid gap-2.5">
                    <ModeCard mode="full" selected={mode === "full"} plan={plans.full} plans={plans} onSelect={setMode} />
                    <ModeCard mode="quick" selected={mode === "quick"} plan={plans.quick} plans={plans} onSelect={setMode} />
                  </div>
                  <p className="m-0 mt-3 text-[13px] text-app-ink-soft">{t("rex.bs.balance", { count: plans.balance })}</p>
                  {!plans.full.canBuild && !plans.quick.canBuild ? (
                    <div className="mt-3 grid gap-2">
                      <Notice>{t("rex.bs.noBuilds")}</Notice>
                      <BuyCreditsButton label={t("rex.ch.buyCredits")} />
                    </div>
                  ) : plans.full.photosShort > 0 && mode === "full" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-app-ink-soft">
                      {t("rex.bs.short", { count: plans.full.photosShort })}
                      <BuyCreditsButton variant="link" label={t("rex.ch.buyCredits")} />
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="mt-5 grid gap-2 rounded-[16px] bg-app-canvas p-4 text-[13px] leading-[1.45]">
                <SummaryLine icon="store" text={brief.trim() ? brief.trim().slice(0, 140) : t("rex.bs.noBrief")} />
                <SummaryLine
                  icon="sparkle"
                  text={[
                    links.length ? links.map((link) => link.host).join(", ") : "",
                    screenshots.length ? t("rex.bs.shotsCount", { count: screenshots.length }) : "",
                    themeId ? t("rex.bs.themeChosen", { name: themeLibraryEntry(themeId)?.name ?? themeId }) : "",
                    note.trim() ? `“${note.trim().slice(0, 80)}”` : "",
                  ].filter(Boolean).join(" · ") || t("rex.bs.noInspo")}
                />
                <SummaryLine icon="lock" text={t("rex.bs.safe")} />
              </div>
            </div>
          ) : null}

          {error ? <div className="mt-4"><Notice>{error}</Notice></div> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-app-line px-5 py-4 sm:px-6">
          {step > 0 ? (
            <PillButton tone="white" size="md" onClick={() => { setError(null); setStep(step - 1); }}>{t("rex.bs.back")}</PillButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {current === "inspiration" ? (
              <button type="button" onClick={() => { setError(null); setStep(step + 1); }} className="min-h-[44px] rounded-full px-3 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
                {t("rex.bs.skip")}
              </button>
            ) : null}
            {current === "build" ? (
              <PillButton size="md" tone="accent" disabled={!canStart} onClick={start}>
                <Icon name="wand" size={16} /> {t("rex.bs.start")}
              </PillButton>
            ) : (
              <PillButton size="md" disabled={current === "business" && !brief.trim()} onClick={() => { setError(null); setStep(step + 1); }}>
                {t("rex.bs.next")}
              </PillButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryLine({ icon, text }: { icon: "store" | "sparkle" | "lock"; text: string }) {
  return (
    <p className="m-0 flex items-start gap-2">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{text}</span>
    </p>
  );
}

function ModeCard({ mode, selected, plan, plans, onSelect }: { mode: BuildMode; selected: boolean; plan: BuildPlan; plans: BuildPlans; onSelect: (mode: BuildMode) => void }) {
  const t = useT("builder", "common");
  const cost = !plan.canBuild
    ? t("rex.bs.cantAfford")
    : plan.credits > 0
      ? t("rex.bs.costCredits", { count: plan.credits })
      : t("rex.bs.costFree");
  const body = mode === "quick"
    ? t("rex.bs.quickBody")
    : !plans.imagesOn
      ? t("rex.bs.fullBodyNoPhotos")
      : t("rex.bs.fullBody", { count: plan.photos });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!plan.canBuild}
      onClick={() => onSelect(mode)}
      className={cx("flex w-full items-start gap-3 rounded-[18px] border-2 p-4 text-left disabled:opacity-50", selected ? "border-app-ink bg-app-canvas/40" : "border-app-line hover:border-app-line-strong")}
    >
      <span aria-hidden className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-app-ink" : "border-app-line-strong")}>
        {selected ? <span className="h-2.5 w-2.5 rounded-full bg-app-ink" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-extrabold">{mode === "full" ? t("rex.bs.full") : t("rex.bs.quick")}</span>
          {mode === "full" ? <span className="rounded-full bg-app-ink px-2 py-0.5 text-[11px] font-bold text-white">{t("rex.bs.recommended")}</span> : null}
        </span>
        <span className="mt-1 block text-[13.5px] leading-[1.45] text-app-ink-soft">{body}</span>
        <span className="mt-2 block text-[13px] font-bold">{cost}</span>
      </span>
    </button>
  );
}
