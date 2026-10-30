"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_COPY, VOICE_MAX_SECONDS, mergeVoiceText, voiceErrorMessage, voiceLanguage, voiceTimer } from "@shared/voice-input";
import { useT } from "@/components/i18n/I18nProvider";

const NO_MIC_FOUND = "We couldn't find a microphone. Plug one in, or type it instead.";

// Voice typing for long text fields (build spec 8A). Tap the mic, speak, tap again: the recording goes to
// POST /api/ai/transcribe and the words land in the field (after what's there, or instead of it).
// Put it next to the field. Either pass value + onChange (controlled fields), or targetId (any textarea/input,
// controlled or not: the value is set the way typing would, so React and plain forms both see it).

type Phase = "idle" | "listening" | "working";

export interface VoiceInputButtonProps {
  value?: string;
  onChange?: (next: string) => void;
  /** id of the textarea/input to fill, instead of value + onChange. */
  targetId?: string;
  mode?: "append" | "replace";
  maxLength?: number;
  /** What the field is ("product description"), sent as a hint to the speech model. */
  context?: string;
  /** "full": the big "Tap and speak" pill under a form field. "icon": a round mic for chat composers. */
  variant?: "full" | "icon";
  className?: string;
  disabled?: boolean;
  /** Chats: send what was said straight away (with the merged words), instead of only filling the box. */
  onSpoken?: (text: string) => void;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

function pickMime() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function pageLanguage() {
  if (typeof document === "undefined") return null;
  return voiceLanguage(document.documentElement.lang) ?? voiceLanguage(navigator.language);
}

/** Sets a field's value the way typing would, so React's onChange and plain form posts both pick it up. */
function fillTarget(id: string, spoken: string, mode: "append" | "replace", maxLength?: number) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return false;
  const limit = maxLength ?? (el.maxLength > 0 ? el.maxLength : undefined);
  const next = mergeVoiceText(el.value, spoken, mode, limit);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  return true;
}

export function VoiceInputButton({ value, onChange, targetId, mode = "append", maxLength, context, variant = "full", className = "", disabled, onSpoken }: VoiceInputButtonProps) {
  const t = useT("rex", "common");
  /** VOICE_COPY's English (shared with the API and the phone app) in the person's language; other text as sent. */
  const say = (text: string) => {
    if (text === NO_MIC_FOUND) return t("voice.noMicFound");
    const key = (Object.keys(VOICE_COPY) as Array<keyof typeof VOICE_COPY>).find((name) => VOICE_COPY[name] === text);
    return key ? t.dynamic(`voice.${key}`, text) : text;
  };
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const valueRef = useRef(value ?? "");
  useEffect(() => {
    valueRef.current = value ?? "";
  }, [value]);

  const stopTracks = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  // Leaving the page mid-recording releases the microphone and throws the recording away.
  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stopTracks();
    },
    [stopTracks],
  );

  const deliver = useCallback(
    (spoken: string) => {
      if (targetId && fillTarget(targetId, spoken, mode, maxLength)) return;
      const merged = mergeVoiceText(valueRef.current, spoken, mode, maxLength);
      if (onSpoken) onSpoken(merged);
      else onChange?.(merged);
    },
    [targetId, mode, maxLength, onChange, onSpoken],
  );

  const send = useCallback(
    async (blob: Blob, durationMs: number) => {
      setPhase("working");
      try {
        const form = new FormData();
        const type = blob.type || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        form.append("audio", blob, `voice.${ext}`);
        form.append("durationMs", String(Math.round(durationMs)));
        const language = pageLanguage();
        if (language) form.append("language", language);
        if (context) form.append("context", context);
        const response = await fetch("/api/ai/transcribe", { method: "POST", body: form, credentials: "same-origin" });
        const body = (await response.json().catch(() => null)) as { data?: { text?: string }; text?: string; error?: { code?: string; message?: string } } | null;
        if (!response.ok) {
          setMessage(voiceErrorMessage(body?.error?.code, response.status, body?.error?.message));
          return;
        }
        const text = (body?.data?.text ?? body?.text ?? "").trim();
        if (!text) setMessage(VOICE_COPY.nothingHeard);
        else deliver(text);
      } catch {
        setMessage(VOICE_COPY.failed);
      } finally {
        setPhase("idle");
      }
    },
    [context, deliver],
  );

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setMessage(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage(VOICE_COPY.noMic);
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setMessage(name === "NotFoundError" || name === "OverconstrainedError" ? NO_MIC_FOUND : VOICE_COPY.deniedWeb);
      return;
    }
    stream.current = media;
    const mimeType = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    } catch {
      stopTracks();
      setMessage(VOICE_COPY.noMic);
      return;
    }
    chunks.current = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current;
      stopTracks();
      recorder.current = null;
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || "audio/webm" });
      chunks.current = [];
      if (blob.size === 0 || durationMs < 400) {
        setPhase("idle");
        setMessage(VOICE_COPY.nothingHeard);
        return;
      }
      void send(blob, Math.min(durationMs, VOICE_MAX_SECONDS * 1000));
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start(1000);
    setPhase("listening");
    timer.current = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      // Stops on its own at the one-minute limit.
      if (ms >= VOICE_MAX_SECONDS * 1000) stop();
    }, 250);
  }, [send, stop, stopTracks]);

  const onClick = () => {
    if (phase === "listening") stop();
    else if (phase === "idle") void start();
  };

  const label = say(phase === "listening" ? VOICE_COPY.listening : phase === "working" ? VOICE_COPY.working : VOICE_COPY.idle);
  const shown = message ? say(message) : null;
  const listening = phase === "listening";

  if (variant === "icon") {
    return (
      <span className={`relative inline-flex shrink-0 ${className}`}>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled || phase === "working"}
          aria-label={listening ? `${label} ${voiceTimer(elapsed)}` : label}
          title={label}
          data-voice-input=""
          className={`inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition disabled:opacity-60 ${listening ? "bg-app-accent text-white" : "border border-app-line bg-white text-app-ink hover:border-app-line-strong"}`}
        >
          {phase === "working" ? <Spin /> : <Mic size={18} />}
          {listening && <span className="tabular-nums">{voiceTimer(elapsed)}</span>}
        </button>
        <span className="sr-only" aria-live="polite">{phase !== "idle" ? label : shown ?? ""}</span>
        {message && phase === "idle" && (
          <span role="status" className="absolute bottom-full right-0 z-10 mb-2 w-[240px] rounded-[12px] bg-app-ink px-3 py-2 text-[12.5px] font-semibold leading-[1.4] text-white shadow-lg">
            {shown}
            <button type="button" onClick={() => setMessage(null)} className="ml-2 underline">{t("ok")}</button>
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || phase === "working"}
        data-voice-input=""
        aria-label={listening ? `${label} ${voiceTimer(elapsed)}` : label}
        className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-[14px] font-bold transition disabled:opacity-70 ${listening ? "bg-app-accent text-white" : "border border-app-line bg-white text-app-ink hover:border-app-line-strong"}`}
      >
        <span className={`grid h-8 w-8 place-items-center rounded-full ${listening ? "bg-white/20" : "bg-app-peach text-app-accent-ink"}`}>
          {phase === "working" ? <Spin /> : <Mic size={17} />}
        </span>
        <span aria-hidden>{label}</span>
        {listening && (
          <span className="inline-flex items-center gap-1.5 tabular-nums" aria-hidden>
            <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
            {voiceTimer(elapsed)}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">{phase !== "idle" ? label : ""}</span>
      {message && phase === "idle" && <span role="status" className="text-[13px] font-semibold text-app-ink-soft">{shown}</span>}
    </div>
  );
}

function Mic({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function Spin() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}
