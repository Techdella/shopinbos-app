"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { savePeggyPreferences } from "@/app/actions/workspace";

interface PeggyPreferencesFormProps {
  defaultMemory: string;
  defaultCommStyle: string;
  defaultDailyBrief: string;
}

const COMM_STYLES = ["Direct", "Friendly", "Formal"] as const;
const BRIEF_OPTIONS = ["Off", "Morning only", "Full daily"] as const;

export function PeggyPreferencesForm({ defaultMemory, defaultCommStyle, defaultDailyBrief }: PeggyPreferencesFormProps) {
  const [commStyle, setCommStyle] = useState(defaultCommStyle);
  const [dailyBrief, setDailyBrief] = useState(defaultDailyBrief);

  const chip = (on: boolean) =>
    cx(
      "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold transition",
      on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
    );

  return (
    <form action={savePeggyPreferences} className="rounded-[22px] border border-app-line bg-white p-5">
      <h2 className="m-0 text-[17px] font-extrabold">What Peggy knows</h2>
      <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">
        Peggy learns from your store activity. Check what she knows and choose how she talks to you.
      </p>
      <div className="mt-4">
        <label htmlFor="peggy-memory" className="mb-2 block text-[14px] font-bold">What should Peggy know about your business?</label>
        <textarea
          id="peggy-memory"
          name="memory"
          rows={4}
          defaultValue={defaultMemory}
          placeholder="e.g. We sell handmade leather goods, our busy season is December, and we prefer WhatsApp for customers."
          className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
        />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[14px] font-bold">How Peggy talks</legend>
          <input type="hidden" name="communicationStyle" value={commStyle} />
          <div className="flex flex-wrap gap-2">
            {COMM_STYLES.map((t) => (
              <button key={t} type="button" aria-pressed={commStyle === t} className={chip(commStyle === t)} onClick={() => setCommStyle(t)}>{t}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 p-0 text-[14px] font-bold">Daily brief</legend>
          <input type="hidden" name="dailyBrief" value={dailyBrief} />
          <div className="flex flex-wrap gap-2">
            {BRIEF_OPTIONS.map((t) => (
              <button key={t} type="button" aria-pressed={dailyBrief === t} className={chip(dailyBrief === t)} onClick={() => setDailyBrief(t)}>{t}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <button type="submit" className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white hover:bg-black">
        <Icon name="check" size={16} /> Save
      </button>
    </form>
  );
}
