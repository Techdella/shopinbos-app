"use client";

/* eslint-disable @next/next/no-img-element -- Rex's photo library and the seller's own photos. */

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx, Notice, TextInput } from "@/components/app-ui";
import { FunLoader } from "@/components/brand/FunLoader";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { RexRequestError, useRexResume } from "@/lib/ai/rex-jobs-client";
import { NG_STATES } from "@shared/delivery-market";
import {
  LIBRARY_SHOP_CATEGORIES,
  defaultAreas,
  libraryTabs,
  nextDays,
  plainAboutStory,
  validWhatsapp,
  type DeliveryAreaChoice,
} from "@shared/seller-onboarding";
import { saveContact, writeAbout } from "./api";
import { RexFrame, RexSays } from "./Frame";
import { Chip, SwitchRow } from "./parts";
import type { StepCtx } from "./context";

// Step 4, the pages, on the web: Rex's photo library (D4a, RB-11, each photographer credited), the About story (D4b,
// RB-12: typed or a voice note, Rex writes it) and the contact page with delivery (D4c, RB-13).

const stateName = (state: string) => (state === "FCT" ? "Abuja (FCT)" : state);
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** D4a "Need photos for your About page?" Pick from Rex's library (numbered as they're picked), by category. */
export function MediaStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const tabs = libraryTabs(ctx.flow.categories);
  const [tab, setTab] = useState(tabs[0]!);
  const [picked, setPicked] = useState<string[]>(ctx.flow.media ?? []);
  const library = useMemo(() => ctx.data.library ?? [], [ctx.data.library]);
  const shown = useMemo(() => library.filter((photo) => photo.category === tab), [library, tab]);
  const label = (key: string) => ((LIBRARY_SHOP_CATEGORIES as readonly string[]).includes(key) ? t.dynamic(`sell.cat.${key}`, key) : t.dynamic(`media.cat.${key}`, key));
  const toggle = (url: string) => setPicked((current) => (current.includes(url) ? current.filter((item) => item !== url) : [...current, url].slice(-6)));

  return (
    <RexFrame
      {...ctx.frame}
      wide
      primary={{ title: picked.length ? (picked.length === 1 ? t("media.useOne") : t("media.use", { count: picked.length })) : t("media.skip"), onPress: () => void ctx.next({ media: picked }), testId: "media-use" }}
      onRexChoose={shown.length ? () => ctx.rexChose(t("media.use", { count: Math.min(2, shown.length) }), { media: shown.slice(0, 2).map((photo) => photo.url) }) : null}
    >
      <RexSays title={t("media.title")} sub={t("media.sub")} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {tabs.map((key) => (
          <Chip key={key} label={label(key)} on={tab === key} onPress={() => setTab(key)} />
        ))}
      </div>
      {shown.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {shown.map((photo, index) => {
            const number = picked.indexOf(photo.url) + 1;
            return (
              <button
                key={photo.id}
                type="button"
                aria-label={photo.alt || t("media.pick", { number: index + 1 })}
                aria-pressed={number > 0}
                onClick={() => toggle(photo.url)}
                className={cx("relative aspect-[1/1.12] overflow-hidden rounded-[16px] bg-app-canvas", number ? "ring-[3px] ring-app-accent" : "")}
              >
                <img src={photo.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                {/* The photographer's credit (Unsplash), as the library asks. */}
                {photo.credit ? (
                  <a
                    href={photo.credit.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute inset-x-1.5 bottom-1 truncate text-left text-[10px] text-white/[0.92] no-underline [text-shadow:0_0_3px_rgba(0,0,0,0.7)] hover:underline"
                  >
                    {`${photo.credit.name} / Unsplash`}
                  </a>
                ) : null}
                {number ? <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-app-accent text-[14px] font-extrabold text-app-ink">{number}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <Notice tone="info">{t("media.empty")}</Notice>
      )}
    </RexFrame>
  );
}

/** D4b "Tell me about your business." Two short answers (typed or a voice note); Rex writes the story; "Rewrite it". */
export function AboutStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const locale = useLocale();
  const [started, setStarted] = useState(ctx.flow.about?.started ?? "");
  const [different, setDifferent] = useState(ctx.flow.about?.different ?? "");
  const [story, setStory] = useState(ctx.flow.about?.story ?? "");
  const [round, setRound] = useState(1);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const about = (text: string) => ({ started, different, story: text, images: ctx.flow.media ?? [] });

  // A story Rex finished while the seller was away comes back here (already paid for).
  useRexResume(["store_words"], (job) => {
    if (typeof job.result?.story === "string" && !story) setStory(job.result.story);
  }, !story);

  async function write(next: number, rexPicked = false) {
    setWriting(true);
    setNote(null);
    let text = "";
    try {
      if (!started.trim() && !different.trim()) throw new Error("empty");
      text = (await writeAbout({ started, different, round: next, language: locale })).story;
    } catch (cause) {
      text = plainAboutStory(ctx.data.store.name, started, different);
      setNote(cause instanceof RexRequestError && cause.code === "REX_PENDING" ? cause.message : t("about.offline"));
    } finally {
      setWriting(false);
    }
    setRound(next);
    setStory(text);
    void ctx.save({ about: about(text) });
    if (rexPicked) ctx.rexChose(t("about.rexWrote").replace(/:$/, ""), { about: about(text) });
  }

  const answer = (id: string, label: string, value: string, set: (value: string) => void, placeholder: string, testId: string) => (
    <label htmlFor={id} className="flex flex-col gap-1 rounded-[22px] border border-app-line bg-white px-4 py-3">
      <span className="text-[13.5px] font-semibold text-app-ink-soft">{label}</span>
      <textarea id={id} data-testid={testId} value={value} onChange={(event) => set(event.target.value)} placeholder={placeholder} rows={2} maxLength={400} className="min-h-[30px] resize-none bg-transparent text-[17px] leading-[1.4] text-app-ink outline-none placeholder:text-app-ink-faint" />
    </label>
  );

  return (
    <RexFrame
      {...ctx.frame}
      primary={story ? { title: t("about.good"), onPress: () => void ctx.next({ about: about(story) }), testId: "about-good" } : { title: t("about.write"), busy: writing, disabled: !started.trim() && !different.trim(), onPress: () => void write(1), testId: "about-write" }}
      link={story ? { title: t("about.rewrite"), icon: "refresh", onPress: () => void write(round + 1), testId: "about-rewrite" } : null}
      onRexChoose={story ? null : () => void write(1, true)}
    >
      <RexSays title={t("about.title")} sub={t("about.sub")} />
      {answer("rex-about-started", t("about.started"), started, setStarted, t("about.startedPlaceholder"), "about-started")}
      {answer("rex-about-different", t("about.different"), different, setDifferent, t("about.differentPlaceholder"), "about-different")}
      <div className="flex min-h-[64px] items-center gap-2.5 rounded-[32px] border border-app-line bg-white pl-[18px] pr-2">
        <span className="min-w-0 flex-1 text-[16px] text-app-ink-soft">{t("about.talkWeb")}</span>
        {/* A voice note fills the answer still empty (or adds to the second). */}
        <VoiceInputButton
          variant="icon"
          mode="append"
          value={started.trim() ? different : started}
          onChange={(spoken) => (started.trim() ? setDifferent(spoken) : setStarted(spoken))}
          context="how a small business started and what makes it different"
        />
      </div>
      {writing ? <FunLoader kind="general" /> : null}
      {note ? <Notice tone="info">{note}</Notice> : null}
      {story && !writing ? (
        <div data-testid="about-story" className="flex flex-col gap-1.5 rounded-[22px] bg-app-mint p-4 text-app-forest">
          <span className="inline-flex items-center gap-1.5 text-[15px] font-extrabold">
            <Icon name="sparkle" size={16} />
            {t("about.rexWrote")}
          </span>
          <textarea value={story} onChange={(event) => setStory(event.target.value)} rows={5} maxLength={2000} aria-label={t("about.rexWrote")} className="resize-y bg-transparent text-[16px] leading-[1.45] text-app-forest outline-none" />
        </div>
      ) : null}
    </RexFrame>
  );
}

/** D4c "I filled your contact page. Just check it's right." WhatsApp, where they deliver (with days), pickup, pay on delivery. */
export function ContactStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const saved = ctx.flow.contact;
  const [whatsapp, setWhatsapp] = useState(saved?.whatsapp ?? ctx.data.contact?.whatsapp ?? "");
  const [areas, setAreas] = useState<DeliveryAreaChoice[]>(saved?.areas?.length ? saved.areas : defaultAreas(ctx.data.store.state || ctx.data.store.city));
  const [pickup, setPickup] = useState(saved?.pickup ?? ctx.data.contact?.pickup ?? "");
  const [pod, setPod] = useState(saved?.pod ?? true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function confirm() {
    if (!validWhatsapp(whatsapp)) return ctx.setError(t("contact.whatsappNeeded"));
    setBusy(true);
    ctx.setError(null);
    try {
      const result = await saveContact({ whatsapp, areas, pickup, pod });
      if (result.podProblem) {
        setPod(false);
        setNote(t("contact.podPlan"));
      }
      await ctx.next({ contact: { whatsapp, areas, pickup, pod: pod && !result.podProblem } });
    } catch (cause) {
      ctx.setError(errorText(cause, t("error.save")));
    } finally {
      setBusy(false);
    }
  }

  const box = "flex flex-col gap-1.5 rounded-[22px] border border-app-line bg-white px-4 py-3";
  return (
    <RexFrame {...ctx.frame} primary={{ title: t("contact.ok"), busy, onPress: () => void confirm(), testId: "contact-ok" }}>
      <RexSays title={t("contact.title")} sub={t("contact.sub")} />
      <label htmlFor="rex-contact-whatsapp" className={box}>
        <span className="text-[13.5px] font-semibold text-app-ink-soft">{t("contact.whatsapp")}</span>
        <input id="rex-contact-whatsapp" data-testid="contact-whatsapp" type="tel" inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder={t("contact.whatsappPlaceholder")} maxLength={20} className="bg-transparent py-0.5 text-[19px] text-app-ink outline-none placeholder:text-app-ink-faint" />
      </label>
      <div className={box}>
        <span className="text-[13.5px] font-semibold text-app-ink-soft">{t("contact.areas")}</span>
        <div className="flex flex-wrap gap-2">
          {areas.map((area) => (
            <span key={area.state} className="inline-flex items-center rounded-full bg-app-mint text-app-forest">
              <button type="button" onClick={() => setAreas((current) => current.map((item) => (item.state === area.state ? { ...item, days: nextDays(item.days) } : item)))} className="min-h-[40px] rounded-l-full pl-3.5 pr-1.5 text-[15px] font-bold">
                {t("contact.area", { state: stateName(area.state), days: t.dynamic(`contact.days.${area.days}`, area.days) })}
              </button>
              <button type="button" aria-label={t("contact.remove", { state: stateName(area.state) })} onClick={() => setAreas((current) => current.filter((item) => item.state !== area.state))} className="grid h-10 w-9 place-items-center rounded-r-full hover:bg-black/[0.05]">
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
          <select
            aria-label={t("contact.add")}
            value=""
            onChange={(event) => {
              const state = event.target.value;
              if (state) setAreas((current) => (current.some((item) => item.state === state) ? current : [...current, { state, days: "2-3", fee: 3500 }]));
            }}
            className="min-h-[40px] rounded-full bg-app-canvas px-3.5 text-[15px] font-bold text-app-ink"
          >
            <option value="">{`+ ${t("contact.add")}`}</option>
            {NG_STATES.filter((state) => !areas.some((area) => area.state === state)).map((state) => (
              <option key={state} value={state}>{stateName(state)}</option>
            ))}
          </select>
        </div>
        <span className="text-[12.5px] text-app-ink-soft">{t("contact.areaHintWeb")}</span>
      </div>
      <label htmlFor="rex-contact-pickup" className={box}>
        <span className="text-[13.5px] font-semibold text-app-ink-soft">{t("contact.pickup")}</span>
        <TextInput id="rex-contact-pickup" value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder={t("contact.pickupPlaceholder")} maxLength={200} className="h-auto border-0 px-0 py-1" />
      </label>
      <SwitchRow testId="contact-pod" title={t("contact.pod")} sub={t("contact.podSub")} on={pod} onChange={setPod} />
      {note ? <Notice tone="info">{note}</Notice> : null}
    </RexFrame>
  );
}
