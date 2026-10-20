"use client";

import { useState } from "react";
import { NG_STATES, formatArea, parseArea } from "@shared/delivery-market";
import { lgasOf } from "@shared/ng-lgas";
import { useT } from "@/components/i18n/I18nProvider";

// Coverage form helper: pick a state and (optionally) one of its LGAs, then add "State" or "State: LGA" as a new line
// in one of the coverage textareas. The textareas stay the source of truth (free text keeps working).

export function AreaTokenAdder({ targets, selectClass }: { targets: { id: string; label: string }[]; selectClass: string }) {
  const t = useT("logistics", "delivery");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const lgas = lgasOf(state);
  const token = state ? (lga ? `${state}: ${lga}` : state) : "";

  const add = (textareaId: string) => {
    const box = document.getElementById(textareaId);
    if (!(box instanceof HTMLTextAreaElement) || !token) return;
    const lines = box.value.split("\n").map((line) => line.trim()).filter(Boolean);
    const parsed = parseArea(token);
    const same = (line: string) => {
      const other = parseArea(line);
      return parsed && other ? formatArea(other).toLowerCase() === formatArea(parsed).toLowerCase() : line.toLowerCase() === token.toLowerCase();
    };
    if (!lines.some(same)) box.value = [...lines, token].join("\n");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.focus();
  };

  return (
    <div className="grid gap-2 rounded-[14px] border border-app-line bg-app-canvas p-3 lg:col-span-2">
      <span className="text-[15px] font-bold">{t("market.cov.addArea")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t("origin.state")} value={state} onChange={(event) => { setState(event.target.value); setLga(""); }} className={`${selectClass} sm:max-w-[220px]`}>
          <option value="">{t("pickState")}</option>
          {NG_STATES.map((name) => <option key={name} value={name}>{name === "FCT" ? t("fctAbuja") : name}</option>)}
        </select>
        <select aria-label={t("market.cov.lga")} value={lga} onChange={(event) => setLga(event.target.value)} disabled={!state} className={`${selectClass} sm:max-w-[260px]`}>
          <option value="">{t("market.cov.wholeState")}</option>
          {lgas.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={!token}
            onClick={() => add(target.id)}
            className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-4 text-[15px] font-bold disabled:opacity-50"
          >
            {target.label}
          </button>
        ))}
      </div>
    </div>
  );
}
