"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

const MAX_SECONDS = 60;

/** Records the seller's own voiceover with the microphone; hands back the clip (any format the browser records). */
export function VoiceRecorder({ value, onChange }: { value: Blob | null; onChange: (clip: Blob | null) => void }) {
  const t = useT("video");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!value) return setUrl(null);
    const next = URL.createObjectURL(value);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [value]);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        onChange(chunks.length ? new Blob(chunks, { type: media.mimeType || "audio/webm" }) : null);
      };
      media.start(250);
      recorder.current = media;
      setRecording(true);
      setSeconds(0);
      const began = Date.now();
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      setError(t("rec.noMic"));
    }
  }

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
    setRecording(false);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-danger px-4 text-[14px] font-bold text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" aria-hidden /> {t("rec.stop", { seconds })}
          </button>
        ) : (
          <button type="button" onClick={() => void start()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-4 text-[14px] font-bold text-white">
            <Icon name="pulse" size={15} /> {value ? t("rec.again") : t("rec.start")}
          </button>
        )}
        {value && !recording ? (
          <button type="button" onClick={() => onChange(null)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line px-4 text-[14px] font-bold">
            <Icon name="trash" size={14} /> {t("rec.delete")}
          </button>
        ) : null}
      </div>
      {url && !recording ? <audio src={url} controls className="h-10 w-full" /> : null}
      <p className="m-0 text-[12.5px] text-app-ink-soft">{error ?? t("rec.tip")}</p>
    </div>
  );
}
