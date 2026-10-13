"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { BackButton, cx, Mascot, MicIcon, Notice, PillButton, ProgressBars, TextInput, Wordmark } from "@/components/app-ui";
import intentRouting from "@/lib/intent-routing";
import {
  BRAND_LOOKS,
  BRAND_PALETTES,
  ONBOARDING_LANGUAGES,
  REX_GREETING,
  SELL_EXAMPLES,
  shopSlug,
  START_PATHS,
  suggestShopNames,
  type OnboardingLanguage,
  type StartPath,
} from "@shared/onboarding";
import { localeFromName } from "@shared/i18n";
import { useLocale, useSetLocale, useT } from "@/components/i18n/I18nProvider";
import { askRex, buildStore, finishOnboarding, saveMemory, saveStoreName, transcribe, type OnboardingStatus } from "./api";

// Seller onboarding, cut to the two steps that need the seller: tell Rex what you sell, then pick a name and
// look so Rex can build the shop. Everything else (products, payments, delivery, payout bank, going live,
// sharing) is on the Start here page (/home/start), where each step ticks itself from real data and can be
// skipped. The mobile app's longer flow keeps using the same APIs (shared/onboarding.ts, /api/app/onboarding).

const { extractIntentParams, getContinuationPath } = intentRouting;

type Step = "chat" | "brand";
const STEPS: Step[] = ["chat", "brand"];

interface ChatTurn {
  from: "rex" | "me";
  text: string;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function isLanguage(value: unknown): value is OnboardingLanguage {
  return typeof value === "string" && (ONBOARDING_LANGUAGES as readonly string[]).includes(value);
}

export function SellerOnboarding({ initialStatus }: { initialStatus: OnboardingStatus }) {
  const router = useRouter();
  const params = useSearchParams();
  const status = initialStatus;
  const memory = initialStatus.memory;
  const name = firstName(status.ownerName);

  const [step, setStep] = useState<Step>(memory?.screen === "brand" && memory.businessDescription ? "brand" : "chat");
  const [error, setError] = useState<string | null>(null);

  // Chat. The language chips set both the language Rex chats in and the app language (shared/i18n), so a
  // first-time seller picks it once; it starts from the language they already chose (or their browser's).
  const appLocale = useLocale();
  const setAppLocale = useSetLocale();
  const tSettings = useT("settings");
  const appLanguage = ONBOARDING_LANGUAGES.find((item) => localeFromName(item) === appLocale);
  const [lang, setLangState] = useState<OnboardingLanguage>(isLanguage(memory?.languages?.[0]) ? (memory?.languages?.[0] as OnboardingLanguage) : appLanguage ?? "English");
  const setLang = (item: OnboardingLanguage) => {
    setLangState(item);
    const locale = localeFromName(item);
    if (locale && locale !== appLocale) void setAppLocale(locale);
  };
  const [draft, setDraft] = useState("");
  const [description, setDescription] = useState(memory?.businessDescription ?? "");
  const [turns, setTurns] = useState<ChatTurn[]>(memory?.businessDescription ? [{ from: "me", text: memory.businessDescription }] : []);
  const [rexThinking, setRexThinking] = useState(false);
  const [start, setStart] = useState<StartPath | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Brand
  const nameIdeas = useMemo(() => {
    const fromRex = memory?.storeName && memory.storeName !== "Your Store" ? [memory.storeName] : [];
    return Array.from(new Set([...fromRex, ...suggestShopNames(status.ownerName, description)])).slice(0, 3);
  }, [memory?.storeName, status.ownerName, description]);
  const [shopName, setShopName] = useState(status.store.name && !/'s Store$/.test(status.store.name) ? status.store.name : "");
  const [customName, setCustomName] = useState(false);
  const [paletteKey, setPaletteKey] = useState(BRAND_PALETTES.find((item) => item.key === memory?.palette?.id)?.key ?? BRAND_PALETTES[0].key);
  const [lookKey, setLookKey] = useState(BRAND_LOOKS.find((item) => item.templateId === memory?.templateId)?.key ?? BRAND_LOOKS[0].key);
  const [tweak, setTweak] = useState("");
  const [buildNote, setBuildNote] = useState<string | null>(null);
  const resolvedName = shopName.trim() || nameIdeas[0] || `${name}'s Shop`;

  const [busy, setBusy] = useState(false);

  function go(next: Step) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
    void saveMemory({ screen: next }).catch(() => null);
  }

  /** Leaves onboarding for Start here, or for the marketplace action the seller signed up for. */
  async function finish() {
    try {
      await finishOnboarding(status.store.live);
    } catch {
      // Leaving should never feel broken; Start here picks up where onboarding stopped.
    }
    const intent = extractIntentParams(params);
    router.push(Object.keys(intent).length ? getContinuationPath({ role: "seller", ...intent }) : start === "find" ? "/home/start?from=find" : "/home/start");
  }

  async function exit() {
    setBusy(true);
    await finish();
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  async function send(text = draft) {
    const message = text.trim();
    if (!message || rexThinking) return;
    setDraft("");
    setDescription(message);
    setTurns((current) => [...current, { from: "me", text: message }]);
    setRexThinking(true);
    try {
      const result = await askRex(message, { businessDescription: message, languages: [lang], preferredName: status.ownerName });
      setTurns((current) => [...current, { from: "rex", text: `${result.reply ?? "Love it."} Where are you starting from?` }]);
      if (result.memoryPatch?.storeName && !shopName) setShopName(result.memoryPatch.storeName);
    } catch {
      setTurns((current) => [...current, { from: "rex", text: "Got it. Where are you starting from?" }]);
    } finally {
      setRexThinking(false);
    }
  }

  async function toggleMic() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice notes don't work in this browser. Type it instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        try {
          const text = await transcribe(new Blob(chunks, { type: "audio/webm" }));
          if (text) await send(text);
        } catch (micError) {
          setError(micError instanceof Error ? micError.message : "Rex couldn't hear that.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Allow the microphone to send a voice note, or type it instead.");
    }
  }

  async function chooseStart(path: StartPath) {
    setStart(path);
    await saveMemory(
      { businessDescription: description, languages: [lang], buildPath: "rex" },
      // New stores default to "active"; keep them as drafts until the launch payment publishes them.
      status.store.live ? { onboardingState: "BUILDING_REX" } : { onboardingState: "BUILDING_REX", status: "draft" },
    ).catch(() => null);
    go("brand");
  }

  // ── Brand, then Rex builds the shop ────────────────────────────────────────
  const palette = BRAND_PALETTES.find((item) => item.key === paletteKey) ?? BRAND_PALETTES[0];
  const look = BRAND_LOOKS.find((item) => item.key === lookKey) ?? BRAND_LOOKS[0];

  async function confirmBrand() {
    setBusy(true);
    setError(null);
    try {
      await saveStoreName(resolvedName);
      const [primary, accent, background] = palette.swatches;
      await saveMemory({
        storeName: resolvedName,
        templateId: look.templateId,
        palette: { id: palette.key, name: palette.label, colors: { primary, accent, background } },
      }).catch(() => null);
      setBuildNote("Rex is building your shop…");
      // buildStore always saves a design: Rex's, or the plain name, colours and look if Rex is unavailable.
      await buildStore(
        { storeName: resolvedName, slug: shopSlug(resolvedName), description, category: memory?.category, palette, look, tweak: tweak.trim() || undefined },
        (text) => setBuildNote(text.slice(-120)),
      );
      setBuildNote("Your shop is ready. Opening Start here…");
      await finish();
    } catch (brandError) {
      setError(brandError instanceof Error ? brandError.message : "Couldn't save your shop name.");
      setBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const progressIndex = STEPS.indexOf(step);
  const header = (
    <div className="sticky top-0 z-20 -mx-[18px] mb-5 flex items-center gap-4 bg-app-canvas/90 px-[18px] py-3 backdrop-blur">
      <BackButton
        onClick={() => {
          if (step === "brand" && !busy) go("chat");
          else if (step === "chat") router.push("/home/start");
        }}
      />
      <ProgressBars total={STEPS.length} current={progressIndex} />
      <button type="button" onClick={() => void exit()} className="text-[14px] font-bold text-app-ink-soft hover:text-app-ink" disabled={busy}>
        Skip
      </button>
    </div>
  );

  const footer = (children: React.ReactNode) => (
    <div className="sticky bottom-0 z-10 -mx-[18px] mt-6 bg-gradient-to-t from-app-canvas via-app-canvas to-transparent px-[18px] pb-[18px] pt-6">{children}</div>
  );

  const errorBox = error && <div className="mb-4"><Notice>{error}</Notice></div>;

  let body: React.ReactNode = null;

  if (step === "chat") {
    const started = turns.some((turn) => turn.from === "rex");
    body = (
      <>
        <div className="flex items-start gap-3">
          <Mascot name="rex" mood={started ? "idle" : "wave"} className="h-14 w-14 shrink-0" alt="Rex" />
          <div className="rounded-[20px] rounded-tl-[6px] bg-white px-4 py-3.5 text-[16px] font-bold leading-[1.35]">{REX_GREETING[lang](name)}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ONBOARDING_LANGUAGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLang(item)}
              lang={localeFromName(item) ?? undefined}
              className={cx("rounded-full border px-4 py-2 text-[14px] font-bold transition", lang === item ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{tSettings("language.onboarding")}</p>
        <div className="mt-5 grid gap-3">
          {turns.map((turn, index) =>
            turn.from === "me" ? (
              <div key={index} className="ml-10 self-end rounded-[20px] rounded-br-[6px] bg-app-ink px-4 py-3.5 text-[15px] leading-[1.45] text-white">{turn.text}</div>
            ) : (
              <div key={index} className="flex items-end gap-2">
                <Mascot name="rex" className="h-8 w-8 shrink-0" alt="" />
                <div className="mr-6 rounded-[20px] rounded-bl-[6px] bg-white px-4 py-3.5 text-[15px] leading-[1.45]">{turn.text}</div>
              </div>
            ),
          )}
          {rexThinking && (
            <div className="flex items-center gap-2 text-[14px] text-app-ink-soft"><Mascot name="rex" mood="thinking" className="h-8 w-8" alt="" /> Rex is thinking…</div>
          )}
        </div>
        {!turns.length && (
          <button type="button" onClick={() => setDraft(SELL_EXAMPLES[lang])} className="mt-4 text-left text-[13px] text-app-ink-soft underline decoration-dotted underline-offset-4">
            Example: {SELL_EXAMPLES[lang]}
          </button>
        )}
        {(started || (description && !rexThinking && turns.length > 0)) && (
          <div className="mt-5 grid gap-3">
            {START_PATHS.map((path, index) => (
              <button
                key={path.key}
                type="button"
                onClick={() => void chooseStart(path.key)}
                className={cx("flex items-center gap-4 rounded-[20px] border-2 bg-white p-4 text-left transition hover:border-app-line-strong", start === path.key ? "border-app-ink" : "border-transparent")}
              >
                <span className="grid h-11 w-11 place-items-center rounded-[12px] text-[16px]" style={{ background: path.tint }}>{index + 1}</span>
                <span>
                  <span className="block text-[15px] font-extrabold">{path.label}</span>
                  <span className="block text-[13px] text-app-ink-soft">{path.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {error && <div className="mt-4"><Notice>{error}</Notice></div>}
        {footer(
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type, or tap the mic"
              aria-label="Tell Rex what you sell"
              className="h-[54px] min-w-0 flex-1 rounded-full bg-white px-5 text-[16px] outline-none placeholder:text-app-ink-faint focus:ring-2 focus:ring-app-ink/15"
            />
            <button type="button" onClick={() => void toggleMic()} aria-label={recording ? "Stop recording" : "Record a voice note"} className={cx("grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full", recording ? "bg-app-accent text-white" : "bg-white text-app-ink")}>
              <MicIcon />
            </button>
            <button type="submit" aria-label="Send" disabled={!draft.trim() || rexThinking} className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-50">
              <Icon name="arrow" size={20} strokeWidth={2.2} />
            </button>
          </form>,
        )}
      </>
    );
  }

  if (step === "brand") {
    body = (
      <>
        <div className="flex items-center gap-3">
          <Mascot name="rex" className="h-14 w-14 shrink-0" alt="Rex" />
          <h1 className="m-0 text-[26px] font-extrabold leading-[1.1] tracking-[-0.5px]">I made a brand for you. Change anything.</h1>
        </div>
        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Shop name</h2>
        <div className="flex flex-wrap gap-2">
          {nameIdeas.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => {
                setShopName(idea);
                setCustomName(false);
              }}
              className={cx("rounded-full px-4 py-3 text-[14px] font-bold transition", resolvedName === idea && !customName ? "bg-app-ink text-white" : "bg-white text-app-ink hover:bg-app-lilac")}
            >
              {idea}
            </button>
          ))}
          <button type="button" onClick={() => setCustomName(true)} className={cx("rounded-full px-4 py-3 text-[14px] font-bold", customName ? "bg-app-ink text-white" : "bg-white text-app-ink-soft hover:bg-app-lilac")}>
            <Icon name="edit" size={14} /> Type my own
          </button>
        </div>
        {customName && <TextInput className="mt-3" autoFocus placeholder="Your shop name" value={shopName} onChange={(event) => setShopName(event.target.value)} maxLength={60} />}
        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Colours</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {BRAND_PALETTES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              aria-pressed={paletteKey === item.key}
              onClick={() => setPaletteKey(item.key)}
              className={cx("flex gap-1.5 rounded-[18px] border-2 bg-white p-2", paletteKey === item.key ? "border-app-accent" : "border-transparent")}
            >
              {item.swatches.map((swatch) => (
                <span key={swatch} className="h-12 flex-1 rounded-[12px]" style={{ background: swatch, boxShadow: "inset 0 0 0 1px rgba(22,20,31,0.06)" }} />
              ))}
            </button>
          ))}
        </div>
        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Look</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {BRAND_LOOKS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={lookKey === item.key}
              onClick={() => setLookKey(item.key)}
              className={cx("flex h-[216px] flex-col rounded-[18px] border-2 p-2 text-left", lookKey === item.key ? "border-app-accent" : "border-transparent")}
              style={{ background: item.background, color: item.ink }}
            >
              <span className="px-1 pt-1 text-[15px] font-semibold leading-[1.1]" style={{ fontFamily: item.fontCss }}>{resolvedName}</span>
              <span className="mt-2 flex flex-1 flex-col gap-1.5 rounded-[8px] p-1.5" style={{ background: "rgba(255,255,255,0.55)" }}>
                <span className="h-[46%] rounded-[6px]" style={{ background: palette.swatches[1] }} />
                <span className="flex flex-1 gap-1.5">
                  <span className="flex-1 rounded-[6px]" style={{ background: palette.swatches[0], opacity: 0.85 }} />
                  <span className="flex-1 rounded-[6px]" style={{ background: palette.swatches[2], boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }} />
                </span>
              </span>
              <span className="px-1 pb-0.5 pt-2 text-[13px] font-bold">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-white py-1.5 pl-5 pr-1.5">
          <input
            value={tweak}
            onChange={(event) => setTweak(event.target.value)}
            placeholder="Make it warmer, use green…"
            aria-label="Ask Rex to change the design"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-app-ink-faint"
          />
          <span className="grid h-10 w-10 place-items-center rounded-full bg-app-forest text-white" aria-hidden><Icon name="arrow" size={18} /></span>
        </div>
        <p className="mt-2 px-1 text-[12px] text-app-ink-soft">Rex applies this when he builds your shop. Products, payments and delivery come next, on your Start here page.</p>
        {footer(
          <>
            {errorBox}
            {busy && buildNote && <p className="mb-3 text-center text-[13px] text-app-ink-soft" aria-live="polite">{buildNote}</p>}
            <PillButton className="w-full" busy={busy} onClick={() => void confirmBrand()}>{busy ? "Rex is building your shop…" : "Build my shop"}</PillButton>
          </>,
        )}
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink">
      <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col px-[18px] pt-6">
        {step === "chat" && (
          <div className="mb-2 hidden lg:block"><Wordmark /></div>
        )}
        {header}
        <div className="flex flex-1 flex-col">{body}</div>
      </div>
    </div>
  );
}
