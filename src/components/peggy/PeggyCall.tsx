"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mascot, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { createCallSounds, type CallSounds } from "./call-sounds";

// "Call Peggy": a free voice call with Peggy (ElevenLabs) for setup help. Signed in on the web it asks
// /api/app/peggy-call; from the mobile app's link (/call-peggy?t=…) it uses the token instead.

type Start = { signedUrl: string; dynamicVariables: Record<string, string> };

export function PeggyCall(props: { token?: string; size?: "lg" | "md"; className?: string }) {
  return (
    <ConversationProvider>
      <Call {...props} />
    </ConversationProvider>
  );
}

function Call({ token, size = "lg", className }: { token?: string; size?: "lg" | "md"; className?: string }) {
  const [error, setError] = useState<string | null>(null);
  // True from the tap until ElevenLabs connects or fails (the SDK's own status only starts once we have a link).
  const [connecting, setConnecting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const sounds = useRef<CallSounds | null>(null);
  const wasLive = useRef(false);
  const stopWaiting = () => {
    window.clearTimeout(timer.current);
    setConnecting(false);
  };
  /** Stop ringing; with `hungUp`, play the falling chime (only after a call that actually connected). */
  const finish = (hungUp: boolean) => {
    stopWaiting();
    if (hungUp && wasLive.current) sounds.current?.ended();
    else sounds.current?.stopRing();
    wasLive.current = false;
  };
  const conversation = useConversation({
    // A call that fails to start only reports onError (no onDisconnect), so stop waiting here too.
    onError: (message: unknown) => {
      finish(false);
      setError(typeof message === "string" && message ? `The call didn't go through (${message}). Try again, or chat with Peggy instead.` : "The call dropped. Try again.");
    },
    onDisconnect: () => finish(true),
    onConnect: () => {
      wasLive.current = true;
      stopWaiting();
      sounds.current?.connected();
    },
  });
  const live = conversation.status === "connected";
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    sounds.current?.close();
  }, []);

  const start = async () => {
    setError(null);
    setConnecting(true);
    // Made inside the tap, so the browser lets it play the ringing tone.
    sounds.current ??= createCallSounds();
    try {
      // Ask for the microphone up front (the SDK opens its own stream), then let this one go.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setConnecting(false);
      setError("Allow the microphone so Peggy can hear you, then tap Call again.");
      return;
    }
    sounds.current.ring();
    const response = await fetch(token ? "/api/public/peggy-call" : "/api/app/peggy-call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { t: token } : {}) }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: Start; error?: { message?: string } } | null;
    if (!response?.ok || !json?.data) {
      finish(false);
      setError(json?.error?.message ?? "Couldn't reach Peggy just now. Try again.");
      return;
    }
    // Never leave "Calling Peggy…" up forever: give up after 25 seconds without a connection.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      conversation.endSession();
      finish(false);
      setError("Peggy didn't pick up. Check your connection and try again, or chat with her instead.");
    }, 25_000);
    conversation.startSession({ signedUrl: json.data.signedUrl, connectionType: "websocket", dynamicVariables: json.data.dynamicVariables });
  };

  const ringing = connecting && !live;
  const words = ringing ? "Calling Peggy…" : conversation.isSpeaking ? "Peggy is speaking" : conversation.isMuted ? "You're muted" : "Peggy is listening";

  if (live || connecting) {
    return (
      <div className={cx("peggy-call-card flex flex-wrap items-center gap-4 rounded-[22px] bg-app-forest p-4 text-white", className)} role="status" aria-live="polite">
        <span className="relative grid h-14 w-14 shrink-0 place-items-center">
          {ringing && <>
            <span className="peggy-ripple absolute inset-0 rounded-full bg-white/30" aria-hidden />
            <span className="peggy-ripple absolute inset-0 rounded-full bg-white/30 [animation-delay:0.9s]" aria-hidden />
          </>}
          <span className={cx("absolute inset-0 rounded-full bg-white/20 transition-[transform,opacity] duration-500 ease-out", live && conversation.isSpeaking ? "scale-[1.18] opacity-100" : "scale-100 opacity-0")} aria-hidden />
          <span className={cx("relative block h-12 w-12 overflow-hidden rounded-full bg-white p-1", live && conversation.isSpeaking && "peggy-speaking")}><Mascot name="peggy" mood={live ? "idle" : "wave"} className="h-full w-full" alt="" /></span>
        </span>
        <div className="min-w-0 flex-1">
          <div key={words} className="animate-fade-in text-[16px] font-extrabold">{words}</div>
          <div className="text-[13px] text-white/80">Free call · Peggy is Shopinbos&apos;s AI customer support</div>
        </div>
        {live && (
          <button type="button" onClick={() => conversation.setMuted(!conversation.isMuted)} className="animate-fade-in min-h-[44px] rounded-full bg-white/15 px-4 text-[14px] font-bold transition-colors hover:bg-white/25">
            {conversation.isMuted ? "Unmute" : "Mute"}
          </button>
        )}
        <button type="button" onClick={() => { conversation.endSession(); finish(true); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#E86A4F] px-5 text-[14px] font-extrabold transition-[filter,transform] hover:brightness-110 active:scale-[0.97]">
          <Icon name="x" size={15} /> End call
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void start()}
        className={cx("inline-flex w-full items-center justify-center gap-3 rounded-full bg-app-forest font-extrabold text-white shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.98]", size === "lg" ? "min-h-[60px] px-6 text-[17px]" : "min-h-[46px] px-5 text-[15px]")}
      >
        <Icon name="phone" size={size === "lg" ? 20 : 17} /> Call Peggy · free
      </button>
      {error && <p role="alert" className="animate-fade-in mb-0 mt-2 text-[13px] font-semibold text-app-danger">{error}</p>}
    </div>
  );
}
