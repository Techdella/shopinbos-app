"use client";

import { useEffect, useState } from "react";
import { DeviceToggle, Spinner } from "@/components/app-ui";
import { FLOW_VARIABLES } from "@/lib/marketing/flows";
import { EmailFrame } from "./EmailFrame";

// Client pieces shared by the marketing editors (campaigns, templates, automations, forms).

/** JSON request to /api/app/marketing/**; throws the API's message on failure. */
export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json?.data as T;
}

export function errorText(error: unknown, fallback = "Something went wrong. Try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useDebounced<T>(value: T, ms = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** The email as recipients see it, with the shop's brand kit and sample customer details. */
export function EmailPreview({ bodyHtml, preheader, subject }: { bodyHtml: string; preheader?: string | null; subject?: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useDebounced(bodyHtml, 500);
  const pre = useDebounced(preheader ?? "", 500);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ html: string }>("/api/app/marketing/preview", "POST", { bodyHtml: body, preheader: pre || null })
      .then((data) => {
        if (!cancelled) {
          setHtml(data.html);
          setError(null);
        }
      })
      .catch((previewError) => !cancelled && setError(errorText(previewError)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [body, pre]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DeviceToggle value={device} onChange={setDevice} />
        {loading ? <Spinner className="text-app-ink-soft" /> : null}
      </div>
      {subject ? (
        <div className="rounded-[14px] bg-app-canvas px-4 py-2.5 text-[13.5px]">
          <span className="text-app-ink-soft">Subject: </span>
          <strong>{subject.replace(/{{\s*store\s*}}/g, "your shop").replace(/{{\s*name\s*}}/g, "Ada")}</strong>
        </div>
      ) : null}
      {error ? <p className="m-0 text-[13px] text-app-danger">{error}</p> : null}
      <EmailFrame html={html} device={device} className="[&_iframe]:h-[560px]" />
      <p className="m-0 text-[12.5px] text-app-ink-soft">Preview uses a sample customer (Ada). Links and your logo and colours come from your brand kit.</p>
    </div>
  );
}

/** Buttons that insert {{variables}} into the field the seller is editing. */
export function VariableChips({ onInsert, only }: { onInsert: (token: string) => void; only?: string[] }) {
  const list = FLOW_VARIABLES.filter(([key]) => !only || only.includes(key));
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Insert a personal detail">
      {list.map(([key, label]) => (
        <button
          key={key}
          type="button"
          title={label}
          onClick={() => onInsert(`{{${key}}}`)}
          className="min-h-[32px] rounded-full border border-app-line bg-white px-3 text-[12.5px] font-semibold hover:border-app-ink"
        >
          {key.replace(/_/g, " ")}
        </button>
      ))}
    </div>
  );
}

/** Inserts text at the cursor of a textarea/input, returning the new value. */
export function insertAtCursor(element: HTMLTextAreaElement | HTMLInputElement | null, current: string, text: string) {
  if (!element) return current + text;
  const start = element.selectionStart ?? current.length;
  const end = element.selectionEnd ?? current.length;
  const next = current.slice(0, start) + text + current.slice(end);
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}
