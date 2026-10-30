"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { cx, Mascot } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { openScreenOnWeb, screenRoleFromWords, type ScreenRole } from "@shared/peggy-screens";
import { HANG_UP_AFTER_MS, HANG_UP_FALLBACK_MS, shouldHangUp } from "@shared/peggy-goodbye";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyCreditsButton } from "@/components/credits/CreditsBadge";
import { inAppSessionClient } from "@/lib/app-session";
import { ONE_MINUTE_LEFT_NOTE, PAID_CALL_MAX_SECONDS, callPhaseAt, callTimeline, type PeggyCallMode } from "@shared/peggy-call-limits";

// "Call Peggy": a free voice call with Peggy (ElevenLabs) for setup help. Signed in on the web it asks
// /api/app/peggy-call; from the mobile app's link (/call-peggy?t=…) it uses the token instead. Peggy's tools (she
// saves pickup details, areas, prices, descriptions and notes while she talks, and get_dashboard reads the dashboard
// again) run against /api/mobile/peggy-call/action, the same as in the phone app. open_screen runs here: an
// allow-listed web page for the role (shared/peggy-screens.ts). A call placed on a page (`persistent` false) would end
// if that page went away, so the screen opens in a new tab and the call carries on; a call that lives in the app shell
// (`persistent`) moves with the web router. Peggy can hang up herself (end_call): the card then says so.
// Peggy is shown as her avatar, with a pulse ring while she speaks.
//
// Length and price (shared/peggy-call-limits.ts): free plans get 3 free calls a Lagos month, then calls cost AI
// credits by the minute (10 minutes held, the rest given back); every free-plan call lasts up to 10 minutes. The cap
// is enforced by ElevenLabs (the free agent's max_duration_seconds); here a timer shows the time left, tells Peggy at
// 9:00 to sum up ("1 minute left"), ends the call at 10:00 and shows what was covered. When the call ends the server
// is told (POST …/peggy-call/end) so a paid call is settled from ElevenLabs' own length. No credits: the page's
// out-of-credits prompt (and "Top up credits" here; not on pages the phone app opened).

type Start = { signedUrl: string; dynamicVariables: Record<string, string>; callRef?: string; maxSeconds?: number; mode?: PeggyCallMode; perMinute?: number; heldCredits?: number };
type Terms = { mode: PeggyCallMode; callsLeft: number | null; maxSeconds: number; perMinute: number; hold: number; balance: number | null };
type Saved = { kind: string; detail: string };

const SERVER_TOOLS = ["save_pickup_address", "add_pickup_point", "add_coverage", "set_starting_price", "set_description", "save_note", "save_call_summary", "get_dashboard", "lookup_areas"];

function serverTools(token: string | undefined, onSaved: (items: Saved[]) => void) {
  return Object.fromEntries(
    SERVER_TOOLS.map((tool) => [
      tool,
      async (params: Record<string, unknown>) => {
        const response = await fetch("/api/mobile/peggy-call/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, params, ...(token ? { t: token } : {}) }) }).catch(() => null);
        const json = (await response?.json().catch(() => null)) as { data?: { result?: string; saved?: Saved[] } } | null;
        if (Array.isArray(json?.data?.saved) && json.data.saved.length) onSaved(json.data.saved);
        return json?.data?.result ?? "Not saved: something went wrong on our side. Tell them you've noted it and carry on.";
      },
    ]),
  );
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

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
  const t = useT("credits");
  const [error, setError] = useState<string | null>(null);
  const [creditsNeeded, setCreditsNeeded] = useState(false);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [inApp, setInApp] = useState(false);
  // The call in progress: its reference, cap and when it connected; what Peggy saved; and how it ended.
  const callRef = useRef<{ ref: string | null; maxSeconds: number; startedAt: number | null; warned: boolean; held: number }>({ ref: null, maxSeconds: PAID_CALL_MAX_SECONDS, startedAt: null, warned: false, held: 0 });
  const [left, setLeft] = useState<number | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [ended, setEnded] = useState<{ atLimit: boolean; minutes: number; held: number; bill: { charged: number; refunded: number; minutes: number } | null } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [endedByPeggy, setEndedByPeggy] = useState(false);
  const role = useRef<ScreenRole | null>(null);
  // Peggy hangs up with end_call; as a safety net the page also hangs up once they've said they're done and she has
  // said goodbye and finished speaking (shared/peggy-goodbye.ts, the same as the phone app).
  const bye = useRef<{ lastUser: string; pending: boolean; byPeggy: boolean; timer: ReturnType<typeof setTimeout> | null }>({ lastUser: "", pending: false, byPeggy: false, timer: null });
  const endRef = useRef<() => void>(() => {});
  const hangUpAfter = (ms: number) => {
    if (bye.current.timer) clearTimeout(bye.current.timer);
    bye.current.timer = setTimeout(() => {
      if (!bye.current.pending) return;
      bye.current.byPeggy = true;
      endRef.current();
    }, ms);
  };
  // The terms of the next call (signed in only; the app-opened call page has its token instead).
  const loadTerms = () => {
    if (token) return;
    void fetch("/api/app/peggy-call", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: Terms } | null) => setTerms(json?.data ?? null))
      .catch(() => null);
  };
  useEffect(() => {
    setInApp(inAppSessionClient());
    loadTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tells the server the call ended (it reads the real length from ElevenLabs) and shows what it cost. */
  const reportEnd = (conversationId: string | null) => {
    const current = callRef.current;
    if (!current.ref) return;
    const elapsed = current.startedAt ? (Date.now() - current.startedAt) / 1000 : 0;
    const atLimit = current.startedAt !== null && elapsed >= current.maxSeconds - 2;
    const held = current.held;
    setEnded({ atLimit, minutes: Math.round(current.maxSeconds / 60), held, bill: null });
    const body = JSON.stringify({ callRef: current.ref, conversationId, ...(token ? { t: token } : {}) });
    callRef.current = { ...current, ref: null, startedAt: null };
    void fetch(token ? "/api/public/peggy-call/end" : "/api/app/peggy-call/end", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: { settled?: boolean; charged?: number; refunded?: number; minutes?: number } } | null) => {
        const data = json?.data;
        if (data?.settled && typeof data.charged === "number") setEnded((now) => (now ? { ...now, bill: { charged: data.charged ?? 0, refunded: data.refunded ?? 0, minutes: data.minutes ?? 0 } } : now));
        loadTerms();
      })
      .catch(() => null);
  };

  const conversation = useConversation({
    onError: (message: unknown) => setError(typeof message === "string" ? message : "The call dropped. Try again."),
    onDisconnect: (details?: { reason?: string }) => {
      let id: string | null = null;
      try {
        id = conversationRef.current?.getId() || null;
      } catch {
        id = null;
      }
      reportEnd(id);
      setLeft(null);
      setConnecting(false);
      setOpened(null);
      setEndedByPeggy(details?.reason === "agent");
      if (bye.current.byPeggy) setEndedByPeggy(true);
      if (bye.current.timer) clearTimeout(bye.current.timer);
      bye.current = { lastUser: "", pending: false, byPeggy: false, timer: null };
    },
    onConnect: () => {
      setConnecting(false);
      callRef.current = { ...callRef.current, startedAt: Date.now(), warned: false };
    },
    onMessage: ({ message, source }: { message: string; source: "user" | "ai" }) => {
      if (source === "user") {
        bye.current.lastUser = message;
        bye.current.pending = false;
        if (bye.current.timer) clearTimeout(bye.current.timer);
      } else if (shouldHangUp(bye.current.lastUser, message)) {
        bye.current.pending = true;
        hangUpAfter(HANG_UP_FALLBACK_MS);
      }
    },
    onModeChange: ({ mode }: { mode: "speaking" | "listening" }) => {
      if (bye.current.pending) hangUpAfter(mode === "listening" ? HANG_UP_AFTER_MS : HANG_UP_FALLBACK_MS);
    },
  });
  const conversationRef = useRef<typeof conversation | null>(null);
  useEffect(() => {
    endRef.current = () => void conversation.endSession();
    conversationRef.current = conversation;
  });
  const live = conversation.status === "connected";

  // The time left: at 9:00 Peggy is told to sum up and the card says "1 minute left"; at 10:00 the call ends (ElevenLabs
  // closes the line at the same moment on its side).
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const current = callRef.current;
      if (!current.startedAt) return;
      const elapsed = (Date.now() - current.startedAt) / 1000;
      const { endAt } = callTimeline(current.maxSeconds);
      setLeft(endAt - elapsed);
      const phase = callPhaseAt(elapsed, current.maxSeconds);
      if (phase !== "ok" && !current.warned) {
        callRef.current = { ...current, warned: true };
        try {
          conversationRef.current?.sendContextualUpdate(ONE_MINUTE_LEFT_NOTE);
        } catch {
          // The banner still shows.
        }
      }
      if (phase === "over") endRef.current();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [live]);

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
    setCreditsNeeded(false);
    setEndedByPeggy(false);
    setEnded(null);
    setSaved([]);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setConnecting(false);
      setError("Allow the microphone so Peggy can hear you, then tap Call again.");
      return;
    }
    const response = await fetch(token ? "/api/public/peggy-call" : "/api/app/peggy-call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { t: token } : {}) }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: Start; error?: { code?: string; message?: string } } | null;
    if (!response?.ok || !json?.data) {
      setConnecting(false);
      setCreditsNeeded(json?.error?.code === "AI_CREDITS_NEEDED");
      setError(json?.error?.message ?? "Couldn't reach Peggy just now. Try again.");
      return;
    }
    role.current = screenRoleFromWords(json.data.dynamicVariables.role);
    callRef.current = { ref: json.data.callRef ?? null, maxSeconds: json.data.maxSeconds ?? PAID_CALL_MAX_SECONDS, startedAt: null, warned: false, held: json.data.heldCredits ?? 0 };
    const tools = serverTools(token, (items) => setSaved((now) => [...now, ...items]));
    conversation.startSession({ signedUrl: json.data.signedUrl, dynamicVariables: json.data.dynamicVariables, clientTools: { ...tools, open_screen: async (params: Record<string, unknown>) => openScreen(params ?? {}) } });
  };

  if (live || connecting) {
    return (
      <div className={cx("flex flex-wrap items-center gap-4 rounded-[22px] bg-app-forest p-4 text-white", className)} role="status" aria-live="polite">
        <PeggyAvatar speaking={conversation.isSpeaking} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold">{connecting && !live ? "Calling Peggy…" : conversation.isSpeaking ? "Peggy is speaking" : "Peggy is listening"}</div>
          <div className="text-[13px] text-white/80">{opened ?? "Free call · Peggy is Shopinbos's AI customer support"}</div>
          {live && left !== null ? (
            <div className={cx("mt-1 text-[13px] font-bold", left <= 60 ? "text-[#F2A93B]" : "text-white/80")} data-testid="peggy-call-time">
              {left <= 60 ? t("pc.oneMinute") : t("pc.timeLeft", { time: clock(left) })}
            </div>
          ) : null}
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
        <Icon name="phone" size={size === "lg" ? 20 : 17} /> {terms?.mode === "credits" ? t("pc.callCredits", { count: terms.perMinute }) : t("pc.callFree")}
      </button>
      {terms && terms.mode !== "plan" ? (
        <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft" data-testid="peggy-call-terms">
          {terms.mode === "credits" ? t("pc.creditsNote", { perMinute: terms.perMinute, hold: terms.hold }) : t("pc.freeLeft", { count: terms.callsLeft ?? 0 })}
        </p>
      ) : null}
      {ended && !error ? (
        <div role="status" className="mt-3 grid gap-1.5 rounded-[16px] border border-app-line bg-white p-3 text-[13px] text-app-ink" data-testid="peggy-call-summary">
          {ended.atLimit ? <p className="m-0 font-bold">{t("pc.endedLimit", { minutes: ended.minutes })}</p> : endedByPeggy ? <p className="m-0 flex items-center gap-2 font-semibold"><Mascot who="peggy" size={22} alt="" /> {t("pc.endedByPeggy")}</p> : null}
          <p className="m-0 font-extrabold">{t("pc.covered")}</p>
          {saved.length ? (
            <ul className="m-0 grid list-disc gap-0.5 pl-5">
              {saved.map((item, index) => <li key={`${item.kind}-${index}`}>{item.detail}</li>)}
            </ul>
          ) : (
            <p className="m-0 text-app-ink-soft">{t("pc.coveredNone")}</p>
          )}
          {ended.bill ? <p className="m-0 text-app-ink-soft">{t("pc.charged", { charged: ended.bill.charged, minutes: ended.bill.minutes, refunded: ended.bill.refunded })}</p> : ended.held > 0 ? <p className="m-0 text-app-ink-soft">{t("pc.settling")}</p> : null}
        </div>
      ) : null}
      {error && <p role="alert" className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{error}</p>}
      {error && creditsNeeded && !inApp ? <BuyCreditsButton label={t("rs.topUp")} className="mt-2" /> : null}
    </div>
  );
}
