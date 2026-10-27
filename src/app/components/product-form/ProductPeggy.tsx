"use client";

import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Mascot, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useT } from "@/components/i18n/I18nProvider";
import type { AssistantFormState, SuggestionInput } from "@shared/product-assistant";
import { ChatText } from "@/components/chat/ChatText";
import { friendlyError } from "@/lib/errors/report-client";
import { uploadToFolder } from "@/components/media/media-client";

// Peggy docked on the add / edit product page. She opens by herself once per browser session per page kind (new or
// edit) with a short greeting, and can be closed to a small "Ask Peggy" button. The seller tells her sizes, colours
// and prices (or sends a photo); /api/app/products/assistant answers with a checked suggestion that shows as
// "Peggy suggests: …" with Apply / Change. Applying fills the form (and on a saved product, saves those parts).

interface Turn {
  role: "user" | "assistant";
  content: string;
  suggestion?: SuggestionInput | null;
  changes?: string[];
  photo?: string;
  state?: "applied" | "dismissed";
  failed?: boolean;
}

export interface ProductPeggyHandle {
  /** Opens Peggy with this request typed in, ready to send. */
  ask: (prompt: string) => void;
}

interface Props {
  isEdit: boolean;
  /** The form as it is right now (read when the seller sends). */
  getState: () => AssistantFormState;
  /** Applies a suggestion; resolves to a short note to show (saved, or what's left to do). */
  onApply: (suggestion: SuggestionInput) => Promise<string | null>;
  productId?: string | null;
}

const greetedKey = (isEdit: boolean) => `shopinbos.peggy.product-greeted.${isEdit ? "edit" : "new"}`;

export const ProductPeggy = forwardRef<ProductPeggyHandle, Props>(function ProductPeggy({ isEdit, getState, onApply, productId }, ref) {
  const t = useT("productTypes");
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const media = useMediaLibrary();
  const endRef = useRef<HTMLDivElement>(null);

  // Opens once per session for this page kind; never again after the seller has seen it.
  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(greetedKey(isEdit)) === "1";
      sessionStorage.setItem(greetedKey(isEdit), "1");
    } catch {
      seen = false;
    }
    if (seen) return;
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [isEdit]);

  useImperativeHandle(ref, () => ({
    ask(prompt: string) {
      setOpen(true);
      setDraft(prompt);
      window.setTimeout(() => {
        const input = inputRef.current;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 50);
    },
  }));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function uploadPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setPhoto(await uploadToFolder(file, "products"));
    } catch {
      setTurns((current) => [...current, { role: "assistant", content: t("peggy.photoFailed"), failed: true }]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send() {
    const message = draft.trim() || (photo ? t("peggy.photoAsk") : "");
    if (!message || busy) return;
    const sentPhoto = photo;
    const history = turns.filter((turn) => !turn.failed).slice(-8).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));
    setTurns((current) => [...current, { role: "user", content: message, ...(sentPhoto ? { photo: sentPhoto } : {}) }]);
    setDraft("");
    setPhoto(null);
    setBusy(true);
    try {
      const state = getState();
      const res = await fetch("/api/app/products/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.slice(0, 2000),
          history,
          photoUrl: sentPhoto,
          productId: productId ?? null,
          form: {
            name: state.name.slice(0, 200),
            description: state.description.slice(0, 5000),
            productType: state.productType,
            basePrice: state.basePrice,
            options: state.options.filter((option) => option.name.trim() && option.values.length),
            variants: state.variants.map((variant) => ({ options: variant.options, price: variant.price, stock: variant.stock, enabled: variant.enabled })),
            details: state.details,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { message: string; suggestion: SuggestionInput | null; changes: string[] }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? t("peggy.failed"));
      const data = json.data;
      setTurns((current) => [...current, { role: "assistant", content: data.message, suggestion: data.suggestion, changes: data.changes }]);
    } catch (error) {
      setTurns((current) => [...current, { role: "assistant", content: error instanceof Error ? friendlyError(error) : t("peggy.failed"), failed: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function apply(index: number) {
    const turn = turns[index];
    if (!turn?.suggestion) return;
    setTurns((current) => current.map((entry, i) => (i === index ? { ...entry, state: "applied" } : entry)));
    const note = await onApply(turn.suggestion);
    if (note) setTurns((current) => [...current, { role: "assistant", content: note }]);
  }

  function change(index: number) {
    setTurns((current) => current.map((entry, i) => (i === index ? { ...entry, state: "dismissed" } : entry)));
    setDraft(t("peggy.changePrefix"));
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[92px] right-4 z-30 flex h-12 items-center gap-2 rounded-full border border-app-line bg-white pl-1.5 pr-4 text-[14px] font-extrabold text-app-ink shadow-[0_8px_24px_rgba(22,20,31,0.12)] hover:border-app-line-strong sm:bottom-6 sm:right-6"
        aria-label={t("peggy.open")}
      >
        <Mascot name="peggy" className="h-9 w-9" alt="" /> {t("peggy.open")}
      </button>
    );
  }

  return (
    <aside
      aria-label={t("peggy.title")}
      className="fixed inset-x-3 bottom-[88px] z-40 flex max-h-[62vh] flex-col overflow-hidden rounded-[22px] border border-app-line bg-white shadow-[0_18px_48px_rgba(22,20,31,0.18)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px] sm:max-h-[min(560px,75vh)]"
    >
      <header className="flex items-center gap-2.5 bg-app-mint px-3.5 py-2.5">
        <Mascot name="peggy-wave" className="h-9 w-9" alt="" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold leading-tight">Peggy</div>
          <div className="truncate text-[12.5px] text-app-ink-soft">{t("peggy.sub")}</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={t("peggy.close")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/60">
          <Icon name="x" size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3" aria-live="polite">
        <div className="flex flex-col gap-2.5">
          <Bubble role="assistant">{t("peggy.greeting")}</Bubble>
          {turns.length === 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {[t("peggy.example1"), t("peggy.example2")].map((example) => (
                <button key={example} type="button" onClick={() => setDraft(example)} className="min-h-[34px] whitespace-normal rounded-[18px] border border-app-line bg-white px-3 py-1.5 text-left text-[12.5px] font-bold leading-snug hover:border-app-line-strong">
                  {example}
                </button>
              ))}
            </div>
          ) : null}
          {turns.map((turn, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Bubble role={turn.role} failed={turn.failed}>
                {turn.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={turn.photo} alt="" className="mb-1.5 h-20 w-20 rounded-[10px] object-cover" />
                ) : null}
                {turn.role === "assistant" ? <ChatText text={turn.content} /> : turn.content}
              </Bubble>
              {turn.suggestion && turn.changes?.length ? (
                <div className="self-stretch rounded-[16px] border border-app-line bg-white p-3">
                  <div className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("peggy.suggests")}</div>
                  <ul className="m-0 mt-1.5 grid list-none gap-1 p-0 text-[13.5px] leading-snug">
                    {turn.changes.map((line, i) => (
                      <li key={i} className="flex gap-1.5">
                        <Icon name="check" size={13} className="mt-0.5 shrink-0 text-app-success" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  {turn.state === "applied" ? (
                    <p className="m-0 mt-2 text-[13px] font-bold text-app-success">{t("peggy.applied")}</p>
                  ) : turn.state === "dismissed" ? null : (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void apply(index)} className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">
                        {isEdit ? t("peggy.applySave") : t("peggy.apply")}
                      </button>
                      <button type="button" onClick={() => change(index)} className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold">
                        {t("peggy.change")}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <Bubble role="assistant">{t("peggy.thinking")}</Bubble> : null}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="border-t border-app-line p-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {photo ? (
          <div className="mb-2 flex items-center gap-2 text-[12.5px] text-app-ink-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="h-10 w-10 rounded-[8px] object-cover" />
            {t("peggy.photoReady")}
            <button type="button" onClick={() => setPhoto(null)} className="ml-auto font-bold text-app-danger">{t("peggy.removePhoto")}</button>
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <button type="button" onClick={() => void media.open({ accept: "image" }).then(([asset]) => asset && setPhoto(asset.url))} disabled={uploading || busy} aria-label={t("peggy.sendPhoto")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-app-line hover:border-app-line-strong disabled:opacity-50">
            <Icon name={uploading ? "clock" : "image"} size={16} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadPhoto(e.target.files)} aria-label={t("peggy.sendPhoto")} />
          {media.dialog}
          <label htmlFor="product-peggy-input" className="sr-only">{t("peggy.placeholder")}</label>
          <textarea
            id="product-peggy-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("peggy.placeholder")}
            className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-[22px] border border-app-line bg-app-canvas px-4 py-2.5 text-[15px] leading-[1.4] outline-none placeholder:text-app-ink-faint focus:border-app-line-strong field-sizing-content"
          />
          <VoiceInputButton variant="icon" value={draft} onChange={setDraft} maxLength={2000} context="sizes, colours and prices for a product" disabled={busy} />
          <button type="submit" disabled={busy || (!draft.trim() && !photo)} aria-label={t("peggy.send")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-40">
            <Icon name="arrowUp" size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
});

function Bubble({ role, failed, children }: { role: "user" | "assistant"; failed?: boolean; children: ReactNode }) {
  return (
    <div
      className={cx(
        "max-w-[90%] break-words px-3.5 py-2.5 text-[14px] leading-[1.45]",
        role === "user" && "whitespace-pre-wrap",
        role === "user" ? "self-end rounded-[16px] rounded-br-[6px] bg-app-ink text-white" : "self-start rounded-[16px] rounded-tl-[6px] bg-app-mint text-app-ink",
        failed && "bg-app-danger-tint text-app-danger",
      )}
    >
      {children}
    </div>
  );
}
