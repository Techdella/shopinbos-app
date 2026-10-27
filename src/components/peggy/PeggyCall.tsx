"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { cx, Mascot } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { openScreenOnWeb, screenRoleFromWords, type ScreenRole } from "@shared/peggy-screens";

// "Call Peggy": a free voice call with Peggy (ElevenLabs) for setup help. Signed in on the web it asks
// /api/app/peggy-call; from the mobile app's link (/call-peggy?t=…) it uses the token instead. Peggy's tools (she
// saves pickup details, areas, prices, descriptions and notes while she talks, and get_dashboard reads the dashboard
// again) run against /api/mobile/peggy-call/action, the same as in the phone app. open_screen runs here: an
// allow-listed web page for the role (shared/peggy-screens.ts). A call placed on a page (`persistent` false) would end
// if that page went away, so the screen opens in a new tab and the call carries on; a call that lives in the app shell
// (`persistent`) moves with the web router. Peggy can hang up herself (end_call): the card then says so.
// Peggy is shown as her avatar, with a pulse ring while she speaks.

type Start = { signedUrl: string; dynamicVariables: Record<string, string> };

const SERVER_TOOLS = ["save_pickup_address", "add_pickup_point", "add_coverage", "set_starting_price", "set_description", "save_note", "save_call_summary", "get_dashboard", "lookup_areas"];

function serverTools(token: string | undefined) {
  return Object.fromEntries(
    SERVER_TOOLS.map((tool) => [
      tool,
      async (params: Record<string, unknown>) => {
        const response = await fetch("/api/mobile/peggy-call/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, params, ...(token ? { t: token } : {}) }) }).catch(() => null);
        const json = (await response?.json().catch(() => null)) as { data?: { result?: string } } | null;
        return json?.data?.result ?? "Not saved: something went wrong on our side. Tell them you've noted it and carry on.";
      },
    ]),
  );
}

export function PeggyCall(props: { token?: string; size?: "lg" | "md"; className?: string; persistent?: boolean }) {
  return (
    <ConversationProvider>
      <Call {...props} />
    </ConversationProvider>
  );
}

function PeggyAvatar({ speaking, size }: { speaking: boolean; size: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size + 8, height: size + 8 }} data-testid="peggy-avatar">
      <span className={cx("absolute inset-0 rounded-full bg-white/25 motion-reduce:animate-none", speaking && "animate-ping")} aria-hidden />
      <span className="relative grid place-items-center overflow-hidden rounded-full bg-white" style={{ width: size, height: size }}>
        <Mascot who="peggy" mood={speaking ? "wave" : "idle"} size={Math.round(size * 0.9)} alt="" />
      </span>
    </span>
  );
}

function Call({ token, size = "lg", className, persistent = false }: { token?: string; size?: "lg" | "md"; className?: string; persistent?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [endedByPeggy, setEndedByPeggy] = useState(false);
  const role = useRef<ScreenRole | null>(null);
  const conversation = useConversation({
    onError: (message: unknown) => setError(typeof message === "string" ? message : "The call dropped. Try again."),
    onDisconnect: (details?: { reason?: string }) => {
      setConnecting(false);
      setOpened(null);
      setEndedByPeggy(details?.reason === "agent");
    },
    onConnect: () => setConnecting(false),
  });
  const live = conversation.status === "connected";

  // open_screen: only allow-listed pages for this role; never from the signed-out call page. Nothing is pressed.
  const openScreen = (params: Record<string, unknown>) => {
    const { screen, path, reply } = openScreenOnWeb(role.current, params, !token);
    if (!screen || !path) return reply;
    if (persistent) router.push(path);
    else window.open(path, "_blank", "noopener");
    setOpened(`Peggy opened ${screen.name}`);
    return reply;
  };

  const start = async () => {
    setError(null);
    setEndedByPeggy(false);
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
    role.current = screenRoleFromWords(json.data.dynamicVariables.role);
    conversation.startSession({ signedUrl: json.data.signedUrl, dynamicVariables: json.data.dynamicVariables, clientTools: { ...serverTools(token), open_screen: async (params: Record<string, unknown>) => openScreen(params ?? {}) } });
  };

  if (live || connecting) {
    return (
      <div className={cx("flex flex-wrap items-center gap-4 rounded-[22px] bg-app-forest p-4 text-white", className)} role="status" aria-live="polite">
        <PeggyAvatar speaking={conversation.isSpeaking} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">{connecting && !live ? "Calling Peggy…" : conversation.isSpeaking ? "Peggy is speaking" : "Peggy is listening"}</div>
          <div className="text-[13px] text-white/80">{opened ?? "Free call · Peggy is Shopinbos's AI customer support"}</div>
        </div>
        {live && (
          <button type="button" onClick={() => conversation.setMuted(!conversation.isMuted)} className="min-h-[44px] rounded-full bg-white/15 px-4 text-[14px] font-bold">
            {conversation.isMuted ? "Unmute" : "Mute"}
          </button>
        )}
        <button type="button" onClick={() => { conversation.endSession(); setConnecting(false); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#E86A4F] px-5 text-[14px] font-bold">
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
        className={cx("inline-flex w-full items-center justify-center gap-3 rounded-full bg-app-forest font-bold text-white shadow-sm hover:brightness-110", size === "lg" ? "min-h-[60px] px-6 text-[17px]" : "min-h-[46px] px-5 text-[15px]")}
      >
        <Icon name="phone" size={size === "lg" ? 20 : 17} /> Call Peggy · free
      </button>
      {endedByPeggy && !error && (
        <p role="status" className="mb-0 mt-2 flex items-center gap-2 text-[13px] font-semibold text-app-ink-soft">
          <Mascot who="peggy" size={22} alt="" /> Peggy ended the call. Call again any time.
        </p>
      )}
      {error && <p role="alert" className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{error}</p>}
    </div>
  );
}
