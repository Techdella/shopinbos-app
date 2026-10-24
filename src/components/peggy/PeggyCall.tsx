"use client";

import { useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";

// "Call Peggy": a free voice call with Peggy (ElevenLabs) for setup help. Signed in on the web it asks
// /api/app/peggy-call; from the mobile app's link (/call-peggy?t=…) it uses the token instead. Peggy's tools (she
// saves pickup details, areas, prices, descriptions and notes while she talks) run against
// /api/mobile/peggy-call/action, the same as in the phone app.

type Start = { signedUrl: string; dynamicVariables: Record<string, string> };

const TOOLS = ["save_pickup_address", "add_pickup_point", "add_coverage", "set_starting_price", "set_description", "save_note", "save_call_summary", "lookup_areas"];

function callTools(token: string | undefined) {
  return Object.fromEntries(
    TOOLS.map((tool) => [
      tool,
      async (params: Record<string, unknown>) => {
        const response = await fetch("/api/mobile/peggy-call/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, params, ...(token ? { t: token } : {}) }) }).catch(() => null);
        const json = (await response?.json().catch(() => null)) as { data?: { result?: string } } | null;
        return json?.data?.result ?? "Not saved: something went wrong on our side. Tell them you've noted it and carry on.";
      },
    ]),
  );
}

export function PeggyCall(props: { token?: string; size?: "lg" | "md"; className?: string }) {
  return (
    <ConversationProvider>
      <Call {...props} />
    </ConversationProvider>
  );
}

function Call({ token, size = "lg", className }: { token?: string; size?: "lg" | "md"; className?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const conversation = useConversation({
    onError: (message: unknown) => setError(typeof message === "string" ? message : "The call dropped. Try again."),
    onDisconnect: () => setConnecting(false),
    onConnect: () => setConnecting(false),
  });
  const live = conversation.status === "connected";

  const start = async () => {
    setError(null);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setConnecting(false);
      setError("Allow the microphone so Peggy can hear you, then tap Call again.");
      return;
    }
    const response = await fetch(token ? "/api/public/peggy-call" : "/api/app/peggy-call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { t: token } : {}) }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: Start; error?: { message?: string } } | null;
    if (!response?.ok || !json?.data) {
      setConnecting(false);
      setError(json?.error?.message ?? "Couldn't reach Peggy just now. Try again.");
      return;
    }
    conversation.startSession({ signedUrl: json.data.signedUrl, dynamicVariables: json.data.dynamicVariables, clientTools: callTools(token) });
  };

  if (live || connecting) {
    return (
      <div className={cx("flex flex-wrap items-center gap-4 rounded-[22px] bg-app-forest p-4 text-white", className)} role="status" aria-live="polite">
        <span className="relative grid h-14 w-14 shrink-0 place-items-center">
          <span className={cx("absolute inset-0 rounded-full bg-white/25", conversation.isSpeaking && "animate-ping")} aria-hidden />
          <span className="relative grid h-12 w-12 place-items-center rounded-full bg-white text-[18px] font-extrabold text-app-forest" aria-hidden>P</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">{connecting && !live ? "Calling Peggy…" : conversation.isSpeaking ? "Peggy is speaking" : "Peggy is listening"}</div>
          <div className="text-[13px] text-white/80">Free call · Peggy is Shopinbos&apos;s AI customer support</div>
        </div>
        {live && (
          <button type="button" onClick={() => conversation.setMuted(!conversation.isMuted)} className="min-h-[44px] rounded-full bg-white/15 px-4 text-[14px] font-bold">
            {conversation.isMuted ? "Unmute" : "Mute"}
          </button>
        )}
        <button type="button" onClick={() => { conversation.endSession(); setConnecting(false); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#E86A4F] px-5 text-[14px] font-extrabold">
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
        className={cx("inline-flex w-full items-center justify-center gap-3 rounded-full bg-app-forest font-extrabold text-white shadow-sm hover:brightness-110", size === "lg" ? "min-h-[60px] px-6 text-[17px]" : "min-h-[46px] px-5 text-[15px]")}
      >
        <Icon name="phone" size={size === "lg" ? 20 : 17} /> Call Peggy · free
      </button>
      {error && <p role="alert" className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{error}</p>}
    </div>
  );
}
