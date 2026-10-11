"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Icon } from "@/components/ui/Icon";
import { BankLinkingModal } from "@/components/payments/BankLinkingModal";
import { BackButton, cx, Mascot, MicIcon, Notice, PillButton, ProgressBars, QrIcon, Spinner, TextInput, Toggle, Wordmark } from "@/components/app-ui";
import intentRouting from "@/lib/intent-routing";
import {
  BRAND_LOOKS,
  BRAND_PALETTES,
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_PAYMENT_METHODS,
  naira,
  ONBOARDING_LANGUAGES,
  PAYMENT_METHODS,
  PRODUCT_DOORS,
  PROGRESS_STEPS,
  REX_GREETING,
  SELL_EXAMPLES,
  shopSlug,
  START_PATHS,
  suggestShopNames,
  zoneFee,
  type DeliveryZone,
  type OnboardingLanguage,
  type OnboardingStep,
  type PaymentMethodKey,
  type ProductDoor,
  type StartPath,
} from "@shared/onboarding";
import {
  askRex,
  buildStore,
  createProducts,
  draftProducts,
  fetchStatus,
  finishOnboarding,
  saveMemory,
  savePayments,
  saveStoreName,
  startLaunchPayment,
  tickChecklist,
  transcribe,
  type OnboardingStatus,
  type ProductDraft,
} from "./api";

const { extractIntentParams, getContinuationPath } = intentRouting;

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
  const [status, setStatus] = useState(initialStatus);
  const memory = initialStatus.memory;
  const name = firstName(status.ownerName);

  const launchParam = params.get("launch");
  const initialStep: OnboardingStep = (() => {
    const requested = params.get("step");
    if (launchParam === "paid" || status.store.live) return requested === "checklist" ? "checklist" : "live";
    if (launchParam === "failed") return "payments";
    return memory?.screen ?? "chat";
  })();

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [error, setError] = useState<string | null>(launchParam === "failed" ? params.get("error") ?? "Payment didn't go through. Try again." : null);

  // Chat
  const [lang, setLang] = useState<OnboardingLanguage>(isLanguage(memory?.languages?.[0]) ? (memory?.languages?.[0] as OnboardingLanguage) : "English");
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
  const buildRef = useRef<Promise<unknown> | null>(null);
  const resolvedName = shopName.trim() || nameIdeas[0] || `${name}'s Shop`;

  // Products
  const [door, setDoor] = useState<ProductDoor>("snap");
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Payments
  const [methods, setMethods] = useState<Record<PaymentMethodKey, boolean>>(DEFAULT_PAYMENT_METHODS);
  const [zones, setZones] = useState<DeliveryZone[]>(DEFAULT_DELIVERY_ZONES);
  const [bankOpen, setBankOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (launchParam === "paid") void fetchStatus().then(setStatus).catch(() => null);
  }, [launchParam]);

  function go(next: OnboardingStep) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
    if (next === "brand" || next === "products" || next === "payments") {
      void saveMemory({ screen: next }).catch(() => null);
    }
  }

  const progressIndex = PROGRESS_STEPS.indexOf(step);

  async function exit() {
    setBusy(true);
    try {
      await finishOnboarding(status.store.live);
    } catch {
      // Leaving should never feel broken; the dashboard picks up where onboarding stopped.
    }
    const intent = extractIntentParams(params);
    router.push(Object.keys(intent).length ? getContinuationPath({ role: "seller", ...intent }) : "/home");
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
    if (path === "find") setDoor("sup");
    await saveMemory(
      { businessDescription: description, languages: [lang], buildPath: "rex" },
      // New stores default to "active"; keep them as drafts until the launch payment publishes them.
      status.store.live ? { onboardingState: "BUILDING_REX" } : { onboardingState: "BUILDING_REX", status: "draft" },
    ).catch(() => null);
    go("brand");
  }

  // ── Brand ──────────────────────────────────────────────────────────────────
  const palette = BRAND_PALETTES.find((item) => item.key === paletteKey) ?? BRAND_PALETTES[0];
  const look = BRAND_LOOKS.find((item) => item.key === lookKey) ?? BRAND_LOOKS[0];

  function runBuild(extraTweak?: string) {
    setBuildNote("Rex is building your shop…");
    const promise = buildStore(
      { storeName: resolvedName, slug: shopSlug(resolvedName), description, category: memory?.category, palette, look, tweak: extraTweak },
      (text) => setBuildNote(text.slice(-120)),
    ).then((result) => {
      setBuildNote(result.usedRex ? "Rex finished your shop design." : "Your shop design is saved. Rex can polish it later from the editor.");
      return result;
    });
    buildRef.current = promise;
    return promise;
  }

  async function confirmBrand() {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveStoreName(resolvedName);
      setStatus((current) => ({ ...current, store: { ...current.store, name: saved?.name ?? resolvedName, slug: saved?.slug ?? current.store.slug } }));
      const [primary, accent, background] = palette.swatches;
      await saveMemory({
        storeName: resolvedName,
        templateId: look.templateId,
        palette: { id: palette.key, name: palette.label, colors: { primary, accent, background } },
      }).catch(() => null);
      void runBuild(tweak.trim() || undefined);
      go("products");
    } catch (brandError) {
      setError(brandError instanceof Error ? brandError.message : "Couldn't save your shop name.");
    } finally {
      setBusy(false);
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────
  async function addPhotos(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 6);
    if (!list.length) return;
    setReading(true);
    setError(null);
    try {
      const result = await draftProducts(list);
      setDrafts((current) => [...current, ...result.drafts].slice(0, 12));
      if (!result.drafted) setError("Rex couldn't name these yet. Add a name and price for each one.");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Rex couldn't read those photos.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function continueFromProducts() {
    const incomplete = drafts.findIndex((item) => !item.name.trim() || !item.price || item.price <= 0);
    if (incomplete >= 0) {
      setEditing(incomplete);
      setError("Add a name and price for every product, or remove it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createProducts(drafts);
      setStatus((current) => ({ ...current, productCount: current.productCount + drafts.length }));
      setDrafts([]);
      go("payments");
    } catch (productError) {
      setError(productError instanceof Error ? productError.message : "Couldn't add those products.");
    } finally {
      setBusy(false);
    }
  }

  // ── Payments + go live ─────────────────────────────────────────────────────
  async function putShopLive() {
    setBusy(true);
    setError(null);
    try {
      await savePayments(methods, zones);
      if (buildRef.current) {
        setBuildNote("Finishing your shop design…");
        await buildRef.current;
      } else if (!status.store.live) {
        await runBuild();
      }
      if (status.store.live) {
        go("live");
      } else {
        setLaunchOpen(true);
      }
    } catch (liveError) {
      setError(liveError instanceof Error ? liveError.message : "Couldn't save your settings.");
    } finally {
      setBusy(false);
    }
  }

  async function pay(option: "full" | "installment") {
    setBusy(true);
    setError(null);
    try {
      const result = await startLaunchPayment(option);
      if ("alreadyLive" in result) {
        setLaunchOpen(false);
        setStatus(await fetchStatus());
        go("live");
        return;
      }
      window.location.assign(result.authorizationUrl);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Couldn't open Paystack.");
      setBusy(false);
    }
  }

  // ── Live ───────────────────────────────────────────────────────────────────
  const shareUrl = status.store.url;
  const shareText = `${status.store.name} is open! Shop here: ${shareUrl}`;

  async function copyLink(message = "Link copied") {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast(message);
    } catch {
      setToast(shareUrl);
    }
  }

  async function openQr() {
    setQr(await QRCode.toDataURL(shareUrl, { width: 640, margin: 1, color: { dark: "#16141F", light: "#FFFFFF" } }));
  }

  async function toggleTask(key: string, done: boolean) {
    try {
      setStatus(await tickChecklist(key, done));
    } catch (taskError) {
      setToast(taskError instanceof Error ? taskError.message : "Couldn't update that.");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const header = progressIndex >= 0 && step !== "live" && (
    <div className="sticky top-0 z-20 -mx-[18px] mb-5 flex items-center gap-4 bg-app-canvas/90 px-[18px] py-3 backdrop-blur">
      <BackButton
        onClick={() => {
          const order: OnboardingStep[] = ["chat", "brand", "products", "payments"];
          const index = order.indexOf(step);
          if (index > 0) go(order[index - 1]);
          else router.push("/home");
        }}
      />
      <ProgressBars total={PROGRESS_STEPS.length} current={progressIndex} />
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
          <Mascot name="rex" className="h-14 w-14 shrink-0" alt="Rex" />
          <div className="rounded-[20px] rounded-tl-[6px] bg-white px-4 py-3.5 text-[16px] font-bold leading-[1.35]">{REX_GREETING[lang](name)}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ONBOARDING_LANGUAGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLang(item)}
              className={cx("rounded-full border px-4 py-2 text-[14px] font-bold transition", lang === item ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {item}
            </button>
          ))}
        </div>
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
            <div className="flex items-center gap-2 text-[14px] text-app-ink-soft"><Mascot name="rex" className="h-8 w-8" alt="" /> Rex is thinking…</div>
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
        <p className="mt-2 px-1 text-[12px] text-app-ink-soft">Rex applies this when he builds your shop.</p>
        {footer(
          <>
            {errorBox}
            <PillButton className="w-full" busy={busy} onClick={() => void confirmBrand()}>Looks good</PillButton>
          </>,
        )}
      </>
    );
  }

  if (step === "products") {
    const doorInfo = PRODUCT_DOORS.find((item) => item.key === door)!;
    body = (
      <>
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Add your first products</h1>
        <p className="mb-5 mt-1.5 text-app-ink-soft">One is enough to go live. Add the rest later.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {PRODUCT_DOORS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDoor(item.key)}
              className={cx("min-h-[118px] rounded-[20px] border-2 bg-white p-4 text-left transition", door === item.key ? "border-app-ink" : "border-transparent hover:border-app-line")}
            >
              <span className="block text-[15px] font-extrabold leading-[1.2]">{item.label}</span>
              <span className="mt-1.5 block text-[13px] leading-[1.35] text-app-ink-soft">{item.hint}</span>
            </button>
          ))}
        </div>
        {door === "snap" ? (
          <div className="mt-4 rounded-[20px] bg-white p-4">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" onChange={(event) => void addPhotos(event.target.files)} />
            {drafts.length > 0 && (
              <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-app-forest">
                <Mascot name="rex" className="h-7 w-7" alt="" /> Rex named and priced these from your photos
              </div>
            )}
            <ul className="m-0 grid list-none gap-1 p-0">
              {drafts.map((item, index) => (
                <li key={`${item.imageUrl}-${index}`} className="rounded-[14px] py-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt="" className="h-[58px] w-[58px] shrink-0 rounded-[12px] object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold">{item.name || "Name this product"}</div>
                      {item.confidence === "check" || !item.price ? (
                        <div className="text-[13px] font-semibold text-app-accent-ink">{item.price ? `Check the price: ${naira(item.price)}?` : "Add a price"}</div>
                      ) : (
                        <div className="truncate text-[13px] text-app-ink-soft">{[naira(item.price), item.detail, `${item.stock} in stock`].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    {editing === index ? null : item.confidence === "check" || !item.price ? (
                      <PillButton tone="white" size="sm" onClick={() => setEditing(index)}>Edit</PillButton>
                    ) : (
                      <button type="button" onClick={() => setEditing(index)} aria-label={`Edit ${item.name}`} className="grid h-9 w-9 place-items-center rounded-full text-app-success hover:bg-app-success-tint">
                        <Icon name="check" size={18} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                  {editing === index && (
                    <div className="mt-3 grid gap-2 rounded-[14px] bg-app-canvas p-3">
                      <TextInput aria-label="Product name" value={item.name} onChange={(event) => setDrafts((current) => current.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))} />
                      <div className="grid grid-cols-2 gap-2">
                        <TextInput aria-label="Price in naira" inputMode="numeric" placeholder="Price (₦)" value={item.price ?? ""} onChange={(event) => setDrafts((current) => current.map((row, i) => (i === index ? { ...row, price: Number(event.target.value.replace(/\D/g, "")) || null } : row)))} />
                        <TextInput aria-label="How many you have" inputMode="numeric" placeholder="In stock" value={item.stock} onChange={(event) => setDrafts((current) => current.map((row, i) => (i === index ? { ...row, stock: Number(event.target.value.replace(/\D/g, "")) || 0 } : row)))} />
                      </div>
                      <div className="flex justify-between">
                        <button type="button" className="text-[13px] font-bold text-app-danger" onClick={() => { setDrafts((current) => current.filter((_, i) => i !== index)); setEditing(null); }}>Remove</button>
                        <PillButton size="sm" onClick={() => { setDrafts((current) => current.map((row, i) => (i === index ? { ...row, confidence: "ok" } : row))); setEditing(null); }}>Done</PillButton>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
              className={cx("flex w-full items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-app-line-strong py-5 text-[15px] font-bold text-app-ink transition hover:bg-app-canvas", drafts.length > 0 && "mt-2")}
            >
              {reading ? <><Spinner /> Rex is looking at your photos…</> : <><Icon name="image" size={18} /> {drafts.length ? "Add more photos" : "Add product photos"}</>}
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-[20px] bg-white p-5">
            <p className="m-0 leading-[1.55] text-app-ink-soft">{doorInfo.note}</p>
            {door === "ig" ? (
              <p className="mb-0 mt-3 text-[13px] font-bold text-app-ink-faint">Instagram import is coming soon. Snap photos for now.</p>
            ) : (
              <a href={door === "file" ? "/products/import" : "/marketplace"} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline">
                {door === "file" ? "Upload a spreadsheet" : "Browse suppliers"} <Icon name="arrow" size={15} />
              </a>
            )}
          </div>
        )}
        {footer(
          <>
            {errorBox}
            <PillButton className="w-full" busy={busy} disabled={reading} onClick={() => void continueFromProducts()}>
              {drafts.length ? `Continue with ${drafts.length} product${drafts.length === 1 ? "" : "s"}` : status.productCount ? "Continue" : "Add products later"}
            </PillButton>
          </>,
        )}
      </>
    );
  }

  if (step === "payments") {
    const bankDone = status.checklist.find((item) => item.key === "bank")?.done;
    body = (
      <>
        <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">Getting paid and delivering</h1>
        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">How customers can pay</h2>
        <div className="divide-y divide-app-line rounded-[20px] bg-white px-4">
          {PAYMENT_METHODS.map((method) => (
            <div key={method.key} className="flex items-center gap-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold">{method.label}</div>
                <div className="text-[13px] leading-[1.35] text-app-ink-soft">{method.hint}</div>
              </div>
              <Toggle label={method.label} on={methods[method.key]} onChange={(on) => setMethods((current) => ({ ...current, [method.key]: on }))} />
            </div>
          ))}
        </div>
        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Where your money goes</h2>
        <div className="rounded-[20px] bg-white p-4">
          {bankDone ? (
            <div className="flex items-center gap-2 text-[15px] font-bold text-app-success"><Icon name="checkCircle" size={18} /> Payout bank added</div>
          ) : (
            <>
              <p className="m-0 leading-[1.5]">You can add your bank later. Until then, payments wait safely in your Shopinbos balance.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <PillButton size="md" onClick={() => setBankOpen(true)}>Add bank now</PillButton>
                <PillButton size="md" tone="white" onClick={() => setToast("No problem. It's on your checklist.")}>Later</PillButton>
              </div>
            </>
          )}
        </div>
        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">Delivery</h2>
        <div className="divide-y divide-app-line rounded-[20px] bg-white px-4">
          {zones.map((zone, index) => (
            <label key={zone.name} className="flex items-center gap-3 py-4">
              <span className="flex-1 text-[15px]">{zone.name}</span>
              {zone.maxFee ? (
                <span className="text-[15px] font-extrabold">{zoneFee(zone)}</span>
              ) : (
                <span className="flex items-center text-[15px] font-extrabold">
                  ₦
                  <input
                    aria-label={`Delivery fee for ${zone.name}`}
                    inputMode="numeric"
                    value={zone.fee.toLocaleString("en-NG")}
                    onChange={(event) => setZones((current) => current.map((row, i) => (i === index ? { ...row, fee: Number(event.target.value.replace(/\D/g, "")) || 0 } : row)))}
                    size={Math.max(3, zone.fee.toLocaleString("en-NG").length)}
                    className="bg-transparent text-right outline-none focus:underline"
                  />
                </span>
              )}
            </label>
          ))}
        </div>
        {!status.store.live && (
          <p className="mt-4 px-1 text-[13px] leading-[1.5] text-app-ink-soft">
            Going live costs {naira(status.launch.totalNgn)} once, or {naira(status.launch.depositNgn)} now and the rest by month end. You pay on Paystack next.
          </p>
        )}
        {footer(
          <>
            {errorBox}
            {buildNote && busy && <p className="mb-3 text-center text-[13px] text-app-ink-soft">{buildNote}</p>}
            <PillButton className="w-full" busy={busy} onClick={() => void putShopLive()}>Put my shop live</PillButton>
          </>,
        )}
        <BankLinkingModal
          isOpen={bankOpen}
          onClose={() => setBankOpen(false)}
          role="seller"
          onSuccess={() => void fetchStatus().then(setStatus).catch(() => null)}
        />
        {launchOpen && (
          <div className="fixed inset-0 z-50 grid items-end bg-black/40 sm:place-items-center" role="presentation" onClick={() => !busy && setLaunchOpen(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="w-full max-w-[480px] rounded-t-[28px] bg-white p-6 sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
              <h2 id="launch-title" className="m-0 text-[24px] font-extrabold tracking-[-0.4px]">Put {status.store.name} live</h2>
              <p className="mb-5 mt-2 leading-[1.5] text-app-ink-soft">A one-off launch fee. Your shop publishes as soon as Paystack confirms it.</p>
              <div className="grid gap-2.5">
                <PillButton busy={busy} onClick={() => void pay("full")}>Pay {naira(status.launch.totalNgn)}</PillButton>
                {status.launch.depositNgn < status.launch.totalNgn && (
                  <PillButton tone="white" size="md" disabled={busy} onClick={() => void pay("installment")}>
                    Pay {naira(status.launch.depositNgn)} now, {naira(status.launch.totalNgn - status.launch.depositNgn)} by month end
                  </PillButton>
                )}
              </div>
              {error && <div className="mt-4"><Notice>{error}</Notice></div>}
              <p className="mb-0 mt-4 text-center text-[12px] text-app-ink-faint">Paystack handles the payment. Shopinbos never sees your card.</p>
            </div>
          </div>
        )}
      </>
    );
  }

  if (step === "live") {
    body = (
      <div className="app-wash -mx-[18px] -mt-6 min-h-dvh px-[18px] pb-8 pt-8">
        <div className="text-center">
          <span className="inline-block rounded-full bg-app-success-tint px-3.5 py-1.5 text-[14px] font-bold text-app-success">{status.store.live ? "Your shop is live" : "Almost there"}</span>
          <h1 className="mb-4 mt-3 text-[32px] font-extrabold leading-[1.05] tracking-[-0.8px]">{status.store.name} is {status.store.live ? "open" : "nearly open"}</h1>
        </div>
        <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_20px_40px_-24px_rgba(22,20,31,0.35)]">
          <div className="grid h-[200px] place-items-center" style={{ background: palette.swatches[1] }}>
            <Mascot name="rex" className="h-36 w-36" alt="" />
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="truncate font-accent text-[20px] italic">{status.store.name}</div>
              <div className="truncate text-[13px] text-app-ink-soft">{shareUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
            </div>
            <PillButton tone="white" size="sm" onClick={() => void copyLink()}>Copy</PillButton>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="grid min-h-[84px] place-items-center gap-1 rounded-[20px] bg-white p-3 text-center text-[13px] font-bold text-app-ink no-underline">
            <span className="text-[#25D366]"><Icon name="whatsapp" size={20} /></span> WhatsApp Status
          </a>
          <button type="button" onClick={() => void copyLink("Link copied. Paste it in your Instagram bio.")} className="grid min-h-[84px] place-items-center gap-1 rounded-[20px] bg-white p-3 text-[13px] font-bold">
            <span className="text-[#C13584]"><Icon name="instagram" size={20} /></span> Instagram bio
          </button>
          <button type="button" onClick={() => void openQr()} className="grid min-h-[84px] place-items-center gap-1 rounded-[20px] bg-white p-3 text-[13px] font-bold">
            <QrIcon size={20} /> QR poster
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-app-mint p-4">
          <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="Peggy" />
          <div>
            <div className="text-[15px] font-extrabold">Let Peggy answer WhatsApp?</div>
            <div className="text-[13px] leading-[1.4] text-app-ink-soft">She drafts replies in your voice. You approve until you trust her.</div>
          </div>
        </div>
        <PillButton className="mt-4 w-full" onClick={() => router.push("/home/social/whatsapp")}>Connect WhatsApp</PillButton>
        <button type="button" onClick={() => go("checklist")} className="mt-2 min-h-[44px] w-full text-[15px] font-bold">Go to my shop</button>
        {qr && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6" role="presentation" onClick={() => setQr(null)}>
            <div role="dialog" aria-modal="true" aria-label="QR poster" className="w-full max-w-[360px] rounded-[28px] bg-white p-6 text-center" onClick={(event) => event.stopPropagation()}>
              <div className="font-accent text-[24px] italic">{status.store.name}</div>
              <p className="mb-3 mt-1 text-[14px] text-app-ink-soft">Scan to shop</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR code for ${shareUrl}`} className="mx-auto w-full max-w-[260px]" />
              <a href={qr} download={`${status.store.slug}-qr.png`} className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-app-ink text-[15px] font-bold text-white no-underline">Download</a>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === "checklist") {
    const done = status.checklist.filter((item) => item.done).length;
    body = (
      <>
        <div className="app-wash -mx-[18px] -mt-6 mb-4 flex items-center gap-3 px-[18px] pb-4 pt-6">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-[18px] font-extrabold text-app-accent-ink">{name.charAt(0).toUpperCase()}</span>
          <div>
            <div className="text-[14px] text-app-ink-soft">Welcome to your shop</div>
            <div className="text-[17px] font-extrabold">{status.store.name}</div>
          </div>
        </div>
        <div className="rounded-[24px] bg-white p-4">
          <div className="flex items-center justify-between">
            <h1 className="m-0 text-[18px] font-extrabold">Finish setting up</h1>
            <span className="text-[14px] font-bold">{done} of {status.checklist.length}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-app-lilac">
            <div className="h-full rounded-full bg-app-accent transition-all" style={{ width: `${(done / status.checklist.length) * 100}%` }} />
          </div>
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
            {status.checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  aria-label={item.done ? `Mark "${item.label}" as not done` : `Mark "${item.label}" as done`}
                  disabled={!item.manual}
                  onClick={() => void toggleTask(item.key, !item.done)}
                  className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-white", item.done ? "border-app-success bg-app-success" : "border-app-toggle-off bg-white", !item.manual && "cursor-default")}
                >
                  {item.done && <Icon name="check" size={14} strokeWidth={3} />}
                </button>
                <a href={item.href} className="min-w-0 flex-1 text-app-ink no-underline">
                  <div className={cx("text-[15px] font-bold", item.done && "line-through")}>{item.label}</div>
                  <div className="text-[13px] text-app-ink-soft">{item.hint}</div>
                </a>
                {!item.done && <Icon name="chevRight" size={16} color="var(--color-app-ink-faint)" />}
              </li>
            ))}
          </ul>
        </div>
        <PillButton className="mt-4 w-full" busy={busy} onClick={() => void exit()}>Go to my dashboard</PillButton>
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
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-app-ink px-5 py-3 text-[14px] font-bold text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
