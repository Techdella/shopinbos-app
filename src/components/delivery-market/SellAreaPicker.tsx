"use client";

import { useState } from "react";
import { field } from "@/components/seller-core";
import { NG_STATES, SELL_AREAS, type SellArea } from "@shared/delivery-market";

// "Where I sell" inside the delivery settings form: one state, selected states or nationwide. Posts sellArea,
// oneState and sellStates (read by saveDeliverySettingsAction).

const WORDS: Record<SellArea, { label: string; hint: string }> = {
  one_state: { label: "One state", hint: "Only customers in one state can order." },
  selected: { label: "Selected states", hint: "Pick the states you deliver to." },
  nationwide: { label: "Nationwide", hint: "Anywhere your delivery partners reach." },
};

export function SellAreaPicker({ sellArea, sellStates }: { sellArea: string; sellStates: string[] }) {
  const [area, setArea] = useState<SellArea>((SELL_AREAS as readonly string[]).includes(sellArea) ? (sellArea as SellArea) : "nationwide");
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {SELL_AREAS.map((key) => (
          <label key={key} className={`flex cursor-pointer gap-2.5 rounded-[14px] border p-3.5 ${area === key ? "border-app-ink" : "border-app-line"}`}>
            <input type="radio" name="sellArea" value={key} checked={area === key} onChange={() => setArea(key)} className={`${field.checkbox} mt-0.5`} />
            <span>
              <span className="block text-[14.5px] font-bold">{WORDS[key].label}</span>
              <span className="block text-[12.5px] text-app-ink-soft">{WORDS[key].hint}</span>
            </span>
          </label>
        ))}
      </div>
      {area === "one_state" && (
        <label className="block max-w-[320px]">
          <span className={field.label}>Your state</span>
          <select name="oneState" defaultValue={sellStates[0] ?? ""} className={field.select}>
            <option value="">Pick a state</option>
            {NG_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
      )}
      {area === "selected" && (
        <fieldset className="m-0 border-0 p-0">
          <legend className={field.label}>States you deliver to</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {NG_STATES.map((state) => (
              <label key={state} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="sellStates" value={state} defaultChecked={sellStates.includes(state)} className={field.checkbox} />
                {state}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
