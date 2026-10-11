"use client";

import { useState } from "react";
import { pillButton } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";

export function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const id = `copy-${label.replace(/\W+/g, "-").toLowerCase()}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold">{label}</label>
      <div className="flex flex-wrap items-start gap-2">
        {multiline ? (
          <textarea id={id} readOnly value={value} rows={3} className="min-w-0 flex-1 resize-none rounded-[14px] border border-app-line bg-app-canvas px-3 py-2 font-mono text-[12.5px] leading-[1.5] text-app-ink" onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <input id={id} readOnly value={value} className="h-11 min-w-0 flex-1 rounded-full border border-app-line bg-app-canvas px-4 font-mono text-[12.5px] text-app-ink" onFocus={(e) => e.currentTarget.select()} />
        )}
        <button type="button" onClick={copy} className={pillButton.white} aria-label={`Copy ${label}`}><Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}
