"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { saveRexPreferences } from "@/app/actions/rex-preferences";
import {
  REX_DESIGN_STYLES,
  REX_IMAGE_STYLES,
  REX_KEEP_VERSIONS,
  REX_LANGUAGES,
  REX_MODES,
  REX_VOICES,
  type RexPreferences,
} from "@shared/rex-preferences";

const chip = (on: boolean) =>
  cx(
    "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold transition",
    on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
  );

function Choice<T extends string>({ legend, name, options, value, onChange }: { legend: string; name: string; options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0 text-[14px] font-bold">{legend}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option.value} type="button" aria-pressed={value === option.value} className={chip(value === option.value)} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Settings > Peggy & Rex: how Rex designs the store. */
export function RexPreferencesForm({ initial, versionCount }: { initial: RexPreferences; versionCount: number }) {
  const [prefs, setPrefs] = useState(initial);
  const set = <K extends keyof RexPreferences>(key: K) => (value: RexPreferences[K]) => setPrefs((current) => ({ ...current, [key]: value }));
  const mode = REX_MODES.find((option) => option.value === prefs.mode);

  return (
    <form action={saveRexPreferences} className="rounded-[22px] border border-app-line bg-white p-5">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/app/rex.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-extrabold">Rex — your store designer</h2>
          <p className="mb-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">How Rex designs your store, writes your words and makes your photos in Rex Studio.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <div>
          <Choice legend="How Rex works" name="mode" options={REX_MODES} value={prefs.mode} onChange={set("mode")} />
          {mode && <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{mode.hint}</p>}
        </div>
        <Choice legend="Design style" name="designStyle" options={REX_DESIGN_STYLES} value={prefs.designStyle} onChange={set("designStyle")} />
        <Choice legend="Photos Rex makes" name="imageStyle" options={REX_IMAGE_STYLES} value={prefs.imageStyle} onChange={set("imageStyle")} />
        <div className="grid gap-5 md:grid-cols-2">
          <Choice legend="Copy voice" name="voice" options={REX_VOICES} value={prefs.voice} onChange={set("voice")} />
          <Choice legend="Language" name="language" options={REX_LANGUAGES} value={prefs.language} onChange={set("language")} />
        </div>

        <div className="grid gap-3 rounded-[16px] bg-app-canvas p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[14.5px] font-bold">Save a version after every change</span>
              <span className="block text-[13px] text-app-ink-soft">
                {prefs.autoSaveVersions ? "Go back to any of them in Rex Studio." : "Off: Rex keeps only your original store and the last change, so Undo still works."}
              </span>
            </span>
            <input type="checkbox" name="autoSaveVersions" checked={prefs.autoSaveVersions} onChange={(event) => set("autoSaveVersions")(event.target.checked)} className="h-5 w-5 shrink-0 accent-app-ink" />
          </label>
          <label className={cx("flex items-center justify-between gap-3", !prefs.autoSaveVersions && "opacity-50")}>
            <span className="text-[14px] font-bold">Keep the last</span>
            <select
              name="keepVersions"
              value={prefs.keepVersions}
              disabled={!prefs.autoSaveVersions}
              onChange={(event) => set("keepVersions")(Number(event.target.value))}
              className="h-10 rounded-full border border-app-line bg-white px-3 text-[14px] font-bold outline-none focus:border-app-ink"
            >
              {REX_KEEP_VERSIONS.map((n) => <option key={n} value={n}>{n} versions</option>)}
            </select>
          </label>
          {/* A disabled select isn't sent, so keep the number when versions are off. */}
          {!prefs.autoSaveVersions && <input type="hidden" name="keepVersions" value={prefs.keepVersions} />}
        </div>

        <div>
          <label htmlFor="rex-brand-notes" className="mb-2 block text-[14px] font-bold">What Rex knows about my brand</label>
          <textarea
            id="rex-brand-notes"
            name="brandNotes"
            rows={4}
            maxLength={2000}
            value={prefs.brandNotes}
            onChange={(event) => set("brandNotes")(event.target.value)}
            placeholder="e.g. Earthy colours, never neon. Our customers are young professionals in Lagos. Always show the Aba craftsmanship."
            className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="submit" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white hover:bg-black">
          <Icon name="check" size={16} /> Save
        </button>
        <Link href="/studio" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong">
          <Icon name="sparkle" size={16} /> Open Rex Studio
        </Link>
        {versionCount > 0 && (
          <Link href="/studio" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">
            Version history · {versionCount} saved
          </Link>
        )}
      </div>
    </form>
  );
}
