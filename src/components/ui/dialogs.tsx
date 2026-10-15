"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { useT } from "@/components/i18n/I18nProvider";

// The app's own alerts, in place of the browser's confirm(), alert() and prompt() (which show "app.shopinbos.com
// says", can't be styled, and look like something a site could fake). Call from anywhere in client code:
//
//   if (!(await confirmDialog({ title: "Delete this ad?", message: "Its link stops counting.", tone: "danger" }))) return;
//   await alertDialog("That didn't save.");
//   const reason = await promptDialog({ title: "Why are you rejecting it?", optional: true });
//
// A plain string works too: "Delete this ad? Its link stops counting." becomes the title "Delete this ad?" and
// the text "Its link stops counting.", and words like delete or remove make it a red (danger) dialog.
// <DialogHost /> (in ClientLayout) shows them one at a time; without it, the browser's dialogs are used.

export type DialogTone = "danger" | "warning" | "default";

export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  icon?: IconName;
}

export interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
  /** Allow an empty answer (OK with nothing typed returns ""). */
  optional?: boolean;
  multiline?: boolean;
  /** Show the value to copy instead of asking for one. */
  readOnly?: boolean;
}

type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: "alert"; options: ConfirmOptions; resolve: (value: void) => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

let queue: Request[] = [];
let nextId = 1;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const DANGER = /\b(delete|remove|revoke|disconnect|unsubscribe|discard|cancel the|end this|stop|rotate|erase|archive)\b/i;
const VERBS = ["Delete", "Remove", "Revoke", "Rotate", "Disconnect", "Unsubscribe", "Discard", "Replace", "End", "Stop", "Leave", "Turn on", "Switch on", "Start", "Reset", "Archive"];

/** Splits "Question? Explanation." into a title and text, and picks the tone and button from the words. */
export function normalizeDialog(input: string | ConfirmOptions): ConfirmOptions {
  if (typeof input !== "string") {
    if (input.title || !input.message) return input;
    const derived = normalizeDialog(input.message);
    return { ...derived, ...input, title: derived.title, message: derived.message };
  }
  const text = input.trim();
  const split = text.match(/^([^?]{2,140}\?)\s+([\s\S]+)$/);
  const title = split ? split[1] : text.length <= 90 ? text : undefined;
  const message = split ? split[2] : text.length <= 90 ? undefined : text;
  const verb = VERBS.find((word) => text.toLowerCase().startsWith(word.toLowerCase()));
  return { title, message, tone: DANGER.test(text) ? "danger" : "default", confirmLabel: verb };
}

function push<T>(kind: Request["kind"], options: ConfirmOptions | PromptOptions, fallback: () => T): Promise<T> {
  if (typeof window === "undefined") return Promise.resolve(fallback());
  if (!hosts) return Promise.resolve(fallback());
  return new Promise<T>((resolve) => {
    queue = [...queue, { id: nextId++, kind, options, resolve } as unknown as Request];
    emit();
  });
}

function plain(options: ConfirmOptions) {
  return [options.title, options.message].filter(Boolean).join("\n\n");
}

/** Ask the seller to confirm. Resolves true for the confirm button, false for Cancel, Escape or a click outside. */
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const options = normalizeDialog(input);
  return push("confirm", options, () => window.confirm(plain(options)));
}

/** Tell the seller something; resolves when they close it. */
export function alertDialog(input: string | ConfirmOptions): Promise<void> {
  const options = typeof input === "string" ? { ...normalizeDialog(input), tone: "default" as const } : input;
  return push("alert", options, () => window.alert(plain(options)));
}

/** Ask for a line of text (null when cancelled), or show a value to copy with `readOnly`. */
export function promptDialog(input: PromptOptions): Promise<string | null> {
  return push("prompt", input, () => window.prompt(plain(input), input.defaultValue ?? ""));
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const TONE: Record<DialogTone, { icon: IconName; tile: string; button: string }> = {
  danger: { icon: "trash", tile: "bg-app-danger-tint text-app-danger", button: "bg-app-danger text-white" },
  warning: { icon: "warn", tile: "bg-[#FDF0D5] text-[#8A5A00]", button: "bg-app-ink text-white" },
  default: { icon: "info", tile: "bg-app-canvas text-app-ink", button: "bg-app-ink text-white" },
};

/** Shows the queued dialogs, one at a time. Mounted once, in ClientLayout. */
export function DialogHost() {
  const current = useSyncExternalStore(subscribe, () => queue[0] ?? null, () => null);
  useEffect(() => {
    hosts += 1;
    return () => {
      hosts -= 1;
    };
  }, []);
  if (!current) return null;
  return createPortal(<DialogPanel key={current.id} request={current} />, document.body);
}

function settle(request: Request, value: boolean | string | null) {
  queue = queue.filter((item) => item.id !== request.id);
  emit();
  if (request.kind === "confirm") request.resolve(Boolean(value));
  else if (request.kind === "alert") request.resolve();
  else request.resolve(typeof value === "string" ? value : null);
}

function DialogPanel({ request }: { request: Request }) {
  const t = useT("ui", "common");
  const titleId = useId();
  const bodyId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const safe = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const options = request.options as PromptOptions;
  const tone = TONE[options.tone ?? "default"];
  const [value, setValue] = useState(options.defaultValue ?? "");
  const [copied, setCopied] = useState(false);
  const isPrompt = request.kind === "prompt";
  const cancel = () => settle(request, request.kind === "confirm" ? false : null);
  const ok = () => {
    if (isPrompt && !options.readOnly && !options.optional && !value.trim()) return field.current?.focus();
    settle(request, isPrompt ? (options.readOnly ? options.defaultValue ?? "" : value) : true);
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Start on the safe choice for confirms; on the field for prompts.
    if (isPrompt) {
      field.current?.focus();
      if (options.readOnly) field.current?.select();
    } else safe.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(options.defaultValue ?? "");
      setCopied(true);
    } catch {
      field.current?.select();
    }
  }

  const confirmLabel = options.confirmLabel ?? (request.kind === "alert" ? t("dialog.ok") : isPrompt && options.readOnly ? t("dialog.done") : request.kind === "confirm" ? t("dialog.continue") : t("dialog.ok"));
  const showCancel = request.kind !== "alert" && !(isPrompt && options.readOnly);

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-[rgba(22,20,31,0.45)] p-0 font-app text-app-ink sm:items-center sm:p-4"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <div
        ref={panel}
        role={request.kind === "prompt" && !options.readOnly ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-labelledby={options.title ? titleId : undefined}
        aria-describedby={options.message ? bodyId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full rounded-t-[24px] bg-white px-5 pb-6 pt-5 shadow-[0_30px_70px_-30px_rgba(22,20,31,0.55)] sm:max-w-[440px] sm:rounded-[24px] sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${tone.tile}`} aria-hidden>
            <Icon name={options.icon ?? tone.icon} size={19} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            {options.title ? <h2 id={titleId} className="m-0 text-[18px] font-extrabold leading-snug tracking-[-0.2px]">{options.title}</h2> : null}
            {options.message ? <p id={bodyId} className={`mb-0 whitespace-pre-line text-[14.5px] leading-[1.55] text-app-ink-soft ${options.title ? "mt-1.5" : "mt-0"}`}>{options.message}</p> : null}
          </div>
        </div>

        {isPrompt ? (
          <div className="mt-4 grid gap-2">
            {options.multiline ? (
              <textarea ref={field} rows={3} value={value} readOnly={options.readOnly} placeholder={options.placeholder} onChange={(event) => setValue(event.target.value)} className="w-full rounded-[14px] border border-app-line px-3.5 py-2.5 text-[15px] outline-none focus:border-app-ink" aria-label={options.title ?? options.message} />
            ) : (
              <input
                ref={field}
                value={options.readOnly ? options.defaultValue ?? "" : value}
                readOnly={options.readOnly}
                placeholder={options.placeholder}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    ok();
                  }
                }}
                className="h-12 w-full rounded-[14px] border border-app-line px-3.5 text-[15px] outline-none focus:border-app-ink"
                aria-label={options.title ?? options.message}
              />
            )}
            {options.readOnly ? (
              <button type="button" onClick={() => void copy()} className="inline-flex min-h-[40px] w-fit items-center gap-1.5 rounded-full border border-app-line px-4 text-[13.5px] font-bold">
                <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? t("dialog.copied") : t("dialog.copy")}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          {showCancel ? (
            <button ref={safe} type="button" onClick={cancel} className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-app-line bg-white px-5 text-[15px] font-bold hover:border-app-line-strong">
              {options.cancelLabel ?? t("cancel")}
            </button>
          ) : null}
          <button
            ref={showCancel ? undefined : safe}
            type="button"
            onClick={ok}
            className={`inline-flex min-h-[48px] items-center justify-center rounded-full px-5 text-[15px] font-bold transition hover:brightness-95 ${tone.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
