"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { REX_REEL_HANDOFF_KEY, type RexCard } from "@/lib/ai/rex/cards";
import { rexCardAction, type RexCardAction } from "./api";

// The cards under Rex's replies: what his tools made, with the buttons that confirm it (save a picture to a
// product, use a logo, apply a description, turn on an automation, undo a store change).

export interface RexCardHandlers {
  /** Send a follow-up to Rex (e.g. "Switch my store to the Noir theme"). */
  onAsk: (prompt: string) => void;
  onOpenPreview: (page: string | null) => void;
  /** Restores the draft to `undoTo`; resolves true when it worked. */
  onUndo: (undoTo: string) => Promise<boolean>;
  busy: boolean;
}

const shell = "w-full min-w-0 rounded-[18px] border border-app-line bg-white p-3.5 sm:p-4";
const pill = "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50";
const primary = cx(pill, "bg-app-ink text-white hover:brightness-110");
const secondary = cx(pill, "border border-app-line bg-white text-app-ink hover:border-app-line-strong");

function useConfirm() {
  const [state, setState] = useState<{ busy: string | null; done: string | null; error: string | null; href?: string }>({ busy: null, done: null, error: null });
  async function run(key: string, payload: RexCardAction) {
    if (state.busy) return;
    setState({ busy: key, done: null, error: null });
    try {
      const result = await rexCardAction(payload);
      setState({ busy: null, done: result.message, error: null, href: result.href });
    } catch (error) {
      setState({ busy: null, done: null, error: error instanceof Error ? error.message : "That didn't save." });
    }
  }
  return { ...state, run };
}

function Outcome({ done, error, href }: { done: string | null; error: string | null; href?: string }) {
  if (error) return <p role="status" className="m-0 mt-2 text-[13px] text-app-danger">{error}</p>;
  if (!done) return null;
  return (
    <p role="status" className="m-0 mt-2 flex flex-wrap items-center gap-x-2 text-[13px] font-bold text-app-success">
      <Icon name="checkCircle" size={15} /> {done}
      {href ? <Link href={href} className="font-bold text-app-ink underline">View</Link> : null}
    </p>
  );
}

function Picture({ src, alt, label, checker }: { src: string; alt: string; label?: string; checker?: boolean }) {
  return (
    <figure className="m-0 min-w-0">
      <div className={cx("aspect-square overflow-hidden rounded-[14px]", checker ? "bg-[repeating-conic-gradient(#EEE_0_25%,#FFF_0_50%)] [background-size:18px_18px]" : "bg-app-canvas")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" />
      </div>
      {label ? <figcaption className="mt-1.5 text-[12.5px] font-bold text-app-ink-soft">{label}</figcaption> : null}
    </figure>
  );
}

function ImageCard({ card, onAsk, busy }: { card: Extract<RexCard, { type: "image" }> } & RexCardHandlers) {
  const confirm = useConfirm();
  const save = (mode: "add" | "main" | "replace") =>
    card.product && confirm.run(mode, { action: "save_product_image", productId: card.product.id, imageUrl: card.after, mode, replaceIndex: mode === "replace" ? card.sourceIndex : null });
  return (
    <section className={shell} aria-label={card.title}>
      <h3 className="m-0 mb-3 text-[14px] font-extrabold">{card.title}</h3>
      <div className={cx("grid gap-3", card.before ? "grid-cols-2" : "max-w-[360px] grid-cols-1")}>
        {card.before ? <Picture src={card.before} alt="Before" label="Before" /> : null}
        <Picture src={card.after} alt={card.before ? "After" : card.title} label={card.before ? "After" : undefined} checker={card.tool === "remove_background"} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {card.product && !confirm.done ? (
          <>
            {card.sourceIndex !== null ? (
              <button type="button" className={primary} disabled={Boolean(confirm.busy)} onClick={() => save("replace")}>
                {confirm.busy === "replace" ? <Spinner className="h-4 w-4" /> : <Icon name="check" size={15} />} Replace the old photo
              </button>
            ) : null}
            <button type="button" className={card.sourceIndex !== null ? secondary : primary} disabled={Boolean(confirm.busy)} onClick={() => save("main")}>
              {confirm.busy === "main" ? <Spinner className="h-4 w-4" /> : null} Make it the main photo
            </button>
            <button type="button" className={secondary} disabled={Boolean(confirm.busy)} onClick={() => save("add")}>
              {confirm.busy === "add" ? <Spinner className="h-4 w-4" /> : <Icon name="plus" size={15} />} Add to {card.product.name}
            </button>
          </>
        ) : null}
        {!card.product ? (
          <button type="button" className={secondary} disabled={busy} onClick={() => onAsk(`Use this picture on my homepage banner: ${card.after}`)}>
            Use on my homepage banner
          </button>
        ) : null}
        <a href={card.after} target="_blank" rel="noopener noreferrer" download className={secondary}>
          <Icon name="download" size={15} /> Download
        </a>
      </div>
      <Outcome {...confirm} />
    </section>
  );
}

function LogosCard({ card }: { card: Extract<RexCard, { type: "logos" }> } & RexCardHandlers) {
  const confirm = useConfirm();
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <section className={shell} aria-label="Logo ideas">
      <h3 className="m-0 mb-3 text-[14px] font-extrabold">Logo ideas</h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        {card.options.map((option) => (
          <li key={option.url} className={cx("rounded-[16px] border p-2.5", chosen === option.url && confirm.done ? "border-app-success" : "border-app-line")}>
            <Picture src={option.url} alt={`${option.label} logo`} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-bold">{option.label}</span>
              <span className="flex shrink-0 gap-1" aria-hidden>
                {[option.palette.primary, option.palette.secondary, option.palette.accent].map((colour) => (
                  <span key={colour} className="h-4 w-4 rounded-full border border-app-line" style={{ background: colour }} />
                ))}
              </span>
            </div>
            <button
              type="button"
              className={cx(primary, "mt-2 w-full")}
              disabled={Boolean(confirm.busy) || (chosen === option.url && Boolean(confirm.done))}
              onClick={() => {
                setChosen(option.url);
                void confirm.run(option.url, { action: "set_logo", imageUrl: option.url });
              }}
            >
              {confirm.busy === option.url ? <Spinner className="h-4 w-4" /> : null}
              {chosen === option.url && confirm.done ? "Your logo" : "Use as my logo"}
            </button>
          </li>
        ))}
      </ul>
      <Outcome {...confirm} />
    </section>
  );
}

function StoreCard({ card, onOpenPreview, onUndo, busy }: { card: Extract<RexCard, { type: "store" }> } & RexCardHandlers) {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  return (
    <section className={shell} aria-label="Store changes">
      <ul className="m-0 list-none space-y-1.5 p-0">
        {card.changes.map((change) => (
          <li key={change} className="flex items-start gap-2 text-[13.5px] font-bold">
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-app-success" />
            <span className="min-w-0">{change}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={primary} onClick={() => onOpenPreview(card.page)}>
          <Icon name="eye" size={15} /> See it
        </button>
        {card.version ? <span className="rounded-full bg-app-canvas px-3 py-1.5 text-[12px] font-bold">Version {card.version.n}</span> : null}
        {undone ? (
          <span className="text-[12.5px] font-bold text-app-ink-soft">Undone</span>
        ) : card.undoTo ? (
          <button
            type="button"
            className={secondary}
            disabled={busy || undoing}
            onClick={async () => {
              setUndoing(true);
              const ok = await onUndo(card.undoTo!);
              setUndoing(false);
              if (ok) setUndone(true);
            }}
          >
            {undoing ? <Spinner className="h-4 w-4" /> : <Icon name="undo" size={15} />} Undo this
          </button>
        ) : null}
      </div>
      <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">Saved to your draft. Shoppers see it after you press Publish.</p>
    </section>
  );
}

function ThemesCard({ card, onAsk, busy }: { card: Extract<RexCard, { type: "themes" }> } & RexCardHandlers) {
  return (
    <section className={shell} aria-label="Themes">
      <h3 className="m-0 mb-3 text-[14px] font-extrabold">Themes you can try</h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 2xl:grid-cols-4">
        {card.themes.map((theme) => {
          const current = theme.id === card.current;
          return (
            <li key={theme.id} className="flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-app-line">
              <div className="flex h-[74px] items-end gap-2 px-3 pb-2.5" style={{ background: theme.swatches.bg }} aria-hidden>
                <span className="text-[18px] font-extrabold leading-none" style={{ color: theme.swatches.ink }}>{theme.name}</span>
                <span className="ml-auto h-5 w-5 rounded-full" style={{ background: theme.swatches.accent }} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="m-0 text-[12.5px] leading-[1.4] text-app-ink-soft">{theme.blurb}</p>
                {current ? (
                  <span className="mt-auto inline-flex min-h-[36px] items-center text-[13px] font-bold text-app-success">Your theme now</span>
                ) : (
                  <button type="button" disabled={busy} className={cx(secondary, "mt-auto min-h-[36px]")} onClick={() => onAsk(`Switch my store to the ${theme.name} theme.`)}>
                    Try {theme.name}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CopyCard({ card }: { card: Extract<RexCard, { type: "copy" }> } & RexCardHandlers) {
  const confirm = useConfirm();
  const [text, setText] = useState(card.after);
  const id = `copy-${card.product.id}`;
  return (
    <section className={shell} aria-label={`New description for ${card.product.name}`}>
      <h3 className="m-0 mb-3 text-[14px] font-extrabold">New description for {card.product.name}</h3>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="m-0 mb-1.5 text-[12.5px] font-bold text-app-ink-soft">Now</p>
          <p className="m-0 whitespace-pre-wrap break-words rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13.5px] leading-[1.5] text-app-ink-soft">{card.before.trim() || "No description yet."}</p>
        </div>
        <div className="min-w-0">
          <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-bold text-app-ink-soft">Rex&apos;s version (you can edit it)</label>
          <textarea
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            maxLength={3000}
            disabled={Boolean(confirm.done)}
            className="block w-full resize-y rounded-[14px] border border-app-line bg-white px-3.5 py-3 text-[13.5px] leading-[1.5] outline-none focus:border-app-ink disabled:bg-app-canvas"
          />
        </div>
      </div>
      {!confirm.done ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={Boolean(confirm.busy) || text.trim().length < 10} onClick={() => void confirm.run("apply", { action: "apply_product_copy", productId: card.product.id, description: text.trim() })}>
            {confirm.busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" size={15} />} Apply to {card.product.name}
          </button>
        </div>
      ) : null}
      <Outcome {...confirm} />
    </section>
  );
}

function VideoCard({ card }: { card: Extract<RexCard, { type: "video" }> } & RexCardHandlers) {
  const router = useRouter();
  function open() {
    try {
      window.sessionStorage.setItem(REX_REEL_HANDOFF_KEY, JSON.stringify({ productId: card.product.id, language: card.language, script: card.script, at: Date.now() }));
    } catch {
      // Without storage the studio still opens on the product; the seller presses "Write it" there.
    }
    router.push(`/home/video?product=${encodeURIComponent(card.product.id)}`);
  }
  return (
    <section className={shell} aria-label={`Reel for ${card.product.name}`}>
      <h3 className="m-0 mb-3 text-[14px] font-extrabold">Reel for {card.product.name}</h3>
      <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-6">
        {card.product.photos.map((photo, index) => (
          <li key={photo} className="relative aspect-[9/16] overflow-hidden rounded-[12px] bg-app-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={`Shot ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-x-1 bottom-1 rounded-[8px] bg-black/60 px-1.5 py-1 text-[10.5px] font-bold leading-tight text-white">{card.script.captions[index]}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-3 text-[13.5px] leading-[1.5]"><span className="font-bold">Voiceover:</span> {card.script.voiceover}</p>
      <p className="m-0 mt-1 text-[13.5px]"><span className="font-bold">End card:</span> {card.script.cta}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={open}>
          <Icon name="play" size={15} /> Open in video studio
        </button>
      </div>
      <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">The video studio records the reel in your browser, then you can save it to the product or download it.</p>
    </section>
  );
}

const MARKETING_LABEL = { campaign: "Email campaign (draft)", automation: "Automation", segment: "Customer segment", content: "Content", template: "Email template (draft)" } as const;

function MarketingCard({ card }: { card: Extract<RexCard, { type: "marketing" }> } & RexCardHandlers) {
  const confirm = useConfirm();
  return (
    <section className={shell} aria-label={card.title}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-peach">
          <Icon name={card.kind === "campaign" ? "megaphone" : card.kind === "automation" ? "automation" : card.kind === "content" ? "document" : card.kind === "template" ? "mail" : "users"} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12.5px] font-bold text-app-ink-soft">{MARKETING_LABEL[card.kind]}</p>
          <h3 className="m-0 text-[15px] font-extrabold leading-tight">{card.title}</h3>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-app-ink-soft">{card.summary}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={card.href} className={secondary}>Open</Link>
        {card.canActivate && !confirm.done ? (
          <button type="button" className={primary} disabled={Boolean(confirm.busy)} onClick={() => void confirm.run("on", { action: "activate_automation", id: card.id })}>
            {confirm.busy ? <Spinner className="h-4 w-4" /> : null} Turn it on
          </button>
        ) : null}
      </div>
      <Outcome {...confirm} />
    </section>
  );
}

function HealthCard({ card, onAsk, busy }: { card: Extract<RexCard, { type: "health" }> } & RexCardHandlers) {
  return (
    <section className={shell} aria-label="Store health">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-mint text-[16px] font-extrabold">{card.score}</span>
        <div>
          <h3 className="m-0 text-[14px] font-extrabold">Store health {card.score} out of 100</h3>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{card.missing.length ? "Biggest gaps first" : "Nothing missing. Nice work."}</p>
        </div>
      </div>
      {card.missing.length ? (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {card.missing.map((item) => (
            <li key={item.label} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 flex-1 text-[13.5px]">{item.label}</span>
              {item.rexPrompt ? (
                <button type="button" disabled={busy} className={cx(secondary, "min-h-[36px]")} onClick={() => onAsk(item.rexPrompt!)}>Ask Rex</button>
              ) : item.href ? (
                <Link href={item.href} className={cx(secondary, "min-h-[36px]")}>Fix it</Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PreviewCard({ card, onOpenPreview }: { card: Extract<RexCard, { type: "preview" }> } & RexCardHandlers) {
  return (
    <button type="button" className={secondary} onClick={() => onOpenPreview(card.page)}>
      <Icon name="eye" size={15} /> Show the preview
    </button>
  );
}

export function RexCardView({ card, ...handlers }: { card: RexCard } & RexCardHandlers): ReactNode {
  switch (card.type) {
    case "image":
      return <ImageCard card={card} {...handlers} />;
    case "logos":
      return <LogosCard card={card} {...handlers} />;
    case "store":
      return <StoreCard card={card} {...handlers} />;
    case "themes":
      return <ThemesCard card={card} {...handlers} />;
    case "copy":
      return <CopyCard card={card} {...handlers} />;
    case "video":
      return <VideoCard card={card} {...handlers} />;
    case "marketing":
      return <MarketingCard card={card} {...handlers} />;
    case "health":
      return <HealthCard card={card} {...handlers} />;
    case "preview":
      return <PreviewCard card={card} {...handlers} />;
  }
}
