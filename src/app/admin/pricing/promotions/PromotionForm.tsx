"use client";

import { useActionState } from "react";
import { Field, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { savePromotion, type PromoFormState } from "@/app/actions/pricing";
import { PRICE_GROUPS, PRICE_KEYS, PRICE_SETTINGS, formatPriceValue, type PriceBook, type PriceGroup, type PriceSetting } from "@shared/platform-pricing";
import { PROMO_AUDIENCES } from "@shared/price-promotions";

// Create or edit a price promotion. Price fields left empty stay at the normal price. The values come back after
// an error (savePromotion returns them), so a long form is never lost.

export interface PromotionFormInitial {
  id: string | null;
  values: Record<string, string>;
}

const UNIT = { naira: "₦", percent: "%", credits: "credits", usd: "$", naira_per_usd: "₦ per $1" } as const;

export function PromotionForm({ initial, base }: { initial: PromotionFormInitial; base: PriceBook }) {
  const [state, action, pending] = useActionState<PromoFormState, FormData>(savePromotion, { error: null, values: null, attempt: 0 });
  const values = state.values ?? initial.values;
  const value = (name: string) => values[name] ?? "";
  const checked = (name: string) => values[name] === "on";
  const groups = Object.keys(PRICE_GROUPS) as PriceGroup[];

  return (
    <form key={state.attempt} action={action} className="grid gap-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && (
        <p role="alert" className="m-0 rounded-[14px] border border-app-danger bg-white p-3 text-[14px] text-app-danger">{state.error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name (only admins see it)" htmlFor="name">
          <input id="name" name="name" required maxLength={120} defaultValue={value("name")} placeholder="Black Friday 2026" className={fieldClass} />
        </Field>
        <Field label="Headline (what people see)" htmlFor="headline">
          <input id="headline" name="headline" required maxLength={160} defaultValue={value("headline")} placeholder="Black Friday: launch your store for ₦5,000" className={fieldClass} />
        </Field>
        <Field label="Starts (Lagos time)" htmlFor="startsAt">
          <input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={value("startsAt")} className={fieldClass} />
        </Field>
        <Field label="Ends (Lagos time)" htmlFor="endsAt" hint="Prices go back to normal at this moment.">
          <input id="endsAt" name="endsAt" type="datetime-local" required defaultValue={value("endsAt")} className={fieldClass} />
        </Field>
      </div>
      <Field label="Message (optional)" htmlFor="message" hint="Goes in the email and the notice, above the list of new prices.">
        <textarea id="message" name="message" rows={3} maxLength={1000} defaultValue={value("message")} className={`${fieldClass} py-2.5`} />
      </Field>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1.5 text-[13.5px] font-bold">Who it&apos;s for</legend>
        <div className="flex flex-wrap gap-4">
          {PROMO_AUDIENCES.map((audience) => (
            <label key={audience.key} className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name={`audience:${audience.key}`} defaultChecked={checked(`audience:${audience.key}`)} /> {audience.label}
            </label>
          ))}
        </div>
        <p className="m-0 text-[12.5px] text-app-ink-soft">They get the email and notice, and see the banner. The new prices apply to everyone who pays them.</p>
      </fieldset>

      <div className="grid gap-2">
        <p className="m-0 text-[13.5px] font-bold">New prices</p>
        <p className="m-0 text-[12.5px] text-app-ink-soft">Fill in only what changes. Empty fields stay at the normal price (shown in grey).</p>
        {groups.map((group) => {
          const keys = PRICE_KEYS.filter((key) => PRICE_SETTINGS[key].group === group);
          const open = keys.some((key) => value(`p:${key}`) !== "");
          return (
            <details key={group} open={open} className="rounded-[14px] border border-app-line bg-white px-4 py-3">
              <summary className="cursor-pointer text-[14px] font-bold">{PRICE_GROUPS[group].title}</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {keys.map((key) => {
                  const setting: PriceSetting = PRICE_SETTINGS[key];
                  const name = `p:${key}`;
                  return (
                    <Field key={key} label={setting.label} htmlFor={name} hint={`Normal: ${formatPriceValue(key, base[key])}`}>
                      {setting.kind === "choice" ? (
                        <select id={name} name={name} defaultValue={value(name)} className={fieldClass}>
                          <option value="">No change</option>
                          {setting.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            id={name}
                            name={name}
                            type="number"
                            inputMode="decimal"
                            min={setting.min}
                            max={setting.max}
                            step={setting.integer ? 1 : "any"}
                            defaultValue={value(name)}
                            placeholder={String(base[key])}
                            className={fieldClass}
                          />
                          <span className="shrink-0 font-mono text-[12px] text-app-ink-soft">{UNIT[setting.unit]}</span>
                        </div>
                      )}
                    </Field>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1.5 text-[13.5px] font-bold">Announce it</legend>
        <label className="flex items-start gap-2 text-[14px]">
          <input type="checkbox" name="announceEmail" defaultChecked={checked("announceEmail")} className="mt-1" />
          <span>Email when it starts. It&apos;s scheduled in Product news, where you can check or edit it before it goes out.</span>
        </label>
        <label className="flex items-start gap-2 text-[14px]">
          <input type="checkbox" name="announceNotice" defaultChecked={checked("announceNotice")} className="mt-1" />
          <span>In-app notice and push to phones when it starts (follows each person&apos;s notification settings).</span>
        </label>
      </fieldset>

      <div>
        <button type="submit" disabled={pending} className={buttonClass("ink")}>
          {pending ? "Saving…" : initial.id ? "Save changes" : "Schedule promotion"}
        </button>
      </div>
    </form>
  );
}
