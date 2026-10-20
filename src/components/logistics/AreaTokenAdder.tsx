"use client";

import { useState } from "react";
import { NG_STATES, formatArea, parseArea } from "@shared/delivery-market";
import { lgasOf } from "@shared/ng-lgas";

// Coverage form helper: pick a state and (optionally) one of its LGAs, then add "State" or "State: LGA" as a new line
// in one of the coverage textareas. The textareas stay the source of truth (free text keeps working).

export function AreaTokenAdder({ targets, selectClass }: { targets: { id: string; label: string }[]; selectClass: string }) {
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
      <span className="text-[15px] font-bold">Add a state or LGA</span>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="State" value={state} onChange={(event) => { setState(event.target.value); setLga(""); }} className={`${selectClass} sm:max-w-[220px]`}>
          <option value="">Pick a state</option>
          {NG_STATES.map((name) => <option key={name} value={name}>{name === "FCT" ? "FCT (Abuja)" : name}</option>)}
        </select>
        <select aria-label="LGA" value={lga} onChange={(event) => setLga(event.target.value)} disabled={!state} className={`${selectClass} sm:max-w-[260px]`}>
          <option value="">Whole state</option>
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
