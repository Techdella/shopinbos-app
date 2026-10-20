"use client";

import { useState, useTransition } from "react";
import { cx } from "@/components/app-ui/cx";
import { PEGGY_AUTO_CHANNELS, PEGGY_CHANNEL_LABEL, PEGGY_DAILY_LIMIT, type PeggyAutoChannel } from "@/lib/support/peggy-pure";

// Admin › Inbox: which new messages Peggy answers by herself. Off by default; the team can always draft with her.

export function PeggyAutoReply({ initial, aiReady }: { initial: PeggyAutoChannel[]; aiReady: boolean }) {
  const [channels, setChannels] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (channel: PeggyAutoChannel) => {
    const next = channels.includes(channel) ? channels.filter((c) => c !== channel) : [...channels, channel];
    setChannels(next);
    setError(null);
    start(async () => {
      const response = await fetch("/api/admin/support/peggy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoReply: next }) }).catch(() => null);
      if (!response?.ok) {
        setChannels(channels);
        setError("That didn't save. Try again.");
      }
    });
  };

  return (
    <section aria-label="Peggy" className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] border border-app-line bg-[#EEF7F5] p-4 sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-forest text-[15px] font-extrabold text-white" aria-hidden>P</span>
      <div className="min-w-0 flex-1 basis-[260px]">
        <div className="text-[15px] font-extrabold">Peggy answers for the team</div>
        <p className="m-0 text-[13px] leading-[1.45] text-app-ink-soft">
          {aiReady
            ? `Open any conversation and tap "Draft with Peggy". Switch a channel on and she replies to new messages herself, using today's prices and marketplace, and leaves anything tricky (complaints, refunds, deals) to a person. She stays out once someone on the team has replied, and sends at most ${PEGGY_DAILY_LIMIT} a day per conversation.`
            : "Peggy needs an AI key on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY)."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Peggy replies by herself to">
        {PEGGY_AUTO_CHANNELS.map((channel) => {
          const on = channels.includes(channel);
          return (
            <button
              key={channel}
              type="button"
              aria-pressed={on}
              disabled={pending || !aiReady}
              onClick={() => toggle(channel)}
              className={cx("inline-flex min-h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold disabled:opacity-60", on ? "border-app-forest bg-app-forest text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              <span className={cx("h-2 w-2 rounded-full", on ? "bg-white" : "bg-app-line-strong")} aria-hidden />
              {PEGGY_CHANNEL_LABEL[channel]}: {on ? "auto" : "drafts"}
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="m-0 w-full text-[13px] font-semibold text-app-danger">{error}</p>}
    </section>
  );
}
