"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";

// The post page while a post is going out: PostWatcher asks the server to check every 3 seconds (which publishes
// an Instagram reel the moment Instagram has it ready) and refreshes the page when anything changes;
// ChannelSteps shows each channel's steps with a running timer.

const CHECK_MS = 3000;
const GIVE_UP_MS = 15 * 60 * 1000;

export function PostWatcher({ postId, active, fingerprint }: { postId: string; active: boolean; fingerprint: string }) {
  const t = useT("socialPosts");
  const router = useRouter();
  const last = useRef(fingerprint);
  last.current = fingerprint;

  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped || Date.now() - started > GIVE_UP_MS) return;
      const response = await fetch(`/api/app/social-posts/${postId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) }).catch(() => null);
      const json = await response?.json().catch(() => null);
      const data = json?.data as { status?: string; results?: unknown } | undefined;
      if (data && JSON.stringify([data.status, data.results]) !== last.current) router.refresh();
      if (!stopped && data?.status === "publishing") timer = window.setTimeout(() => void tick(), CHECK_MS);
      else if (!data && !stopped) timer = window.setTimeout(() => void tick(), CHECK_MS * 2);
    };
    timer = window.setTimeout(() => void tick(), 800);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [active, postId, router]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-app-ink-soft" role="status">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-app-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-app-success" />
      </span>
      {t("prog.live")}
    </span>
  );
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * One channel's steps. reel: sent → Instagram processing (timer, bar) → live; anything else: sending → live.
 * `state`: pending (no result yet), waiting (Instagram processing), posted.
 */
export function ChannelSteps({ channel, reel, state, since }: { channel: string; reel: boolean; state: "pending" | "waiting" | "posted"; since?: string | null }) {
  const t = useT("socialPosts");
  const [now, setNow] = useState(() => Date.now());
  const moving = state !== "posted";
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [moving]);

  const steps = reel
    ? [t("prog.sent", { channel }), t("prog.processing", { channel }), t("prog.liveOn", { channel })]
    : [t("prog.sending", { channel }), t("prog.liveOn", { channel })];
  const active = state === "posted" ? steps.length : reel ? (state === "waiting" ? 1 : 0) : 0;
  const elapsed = since ? now - new Date(since).getTime() : 0;
  // Instagram usually needs 30 seconds to 2 minutes for a reel; the bar eases towards 95% over about 2 minutes.
  const share = state === "posted" ? 100 : reel && state === "waiting" ? Math.min(95, 15 + 80 * (1 - Math.exp(-elapsed / 60000))) : 10;

  return (
    <div className="grid gap-2">
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-[12.5px]">
        {steps.map((label, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <li key={label} className="flex items-center gap-1.5">
              <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full", done ? "bg-app-success text-white" : current ? "bg-app-ink text-white" : "bg-app-canvas text-app-ink-soft")}>
                {done ? <Icon name="check" size={11} /> : current ? <Icon name="refresh" size={11} className="animate-spin" /> : <span className="text-[10px] font-bold">{index + 1}</span>}
              </span>
              <span className={cx(done ? "text-app-ink" : current ? "font-bold text-app-ink" : "text-app-ink-soft")}>{label}</span>
              {index < steps.length - 1 && <span aria-hidden className="mx-0.5 h-px w-4 bg-app-line-strong" />}
            </li>
          );
        })}
      </ol>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full rounded-full transition-[width] duration-1000 ease-out", state === "posted" ? "bg-app-success" : "bg-app-ink")} style={{ width: `${share}%` }} />
      </div>
      {reel && state === "waiting" && (
        <p className="m-0 text-[12px] text-app-ink-soft">
          {t("prog.timer", { time: clock(elapsed) })} · {t("prog.typical")}
        </p>
      )}
    </div>
  );
}
