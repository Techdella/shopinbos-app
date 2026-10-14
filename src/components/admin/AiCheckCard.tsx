"use client";

import { useState } from "react";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";

// Admin → Settings: are the Claude and OpenAI keys in, and do Rex and Peggy really work on each? "Check AI" makes
// one small real call per job (see src/lib/ai/check.server.ts).

type Row = { id: string; label: string; model: string; status: "ok" | "failed" | "skipped"; detail: string; ms?: number };

const TONE = { ok: "success", failed: "danger", skipped: "muted" } as const;
const WORD = { ok: "Working", failed: "Not working", skipped: "Skipped" } as const;

export function AiCheckCard({ claude, openai, first }: { claude: boolean; openai: boolean; first: "anthropic" | "openai" }) {
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "The check couldn't run.");
      setRows(json.data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check couldn't run.");
    } finally {
      setBusy(false);
    }
  }

  const keys = [
    { name: "Claude (Anthropic)", env: "ANTHROPIC_API_KEY", on: claude, primary: first === "anthropic" },
    { name: "OpenAI", env: "OPENAI_API_KEY", on: openai, primary: first === "openai" },
  ];

  return (
    <Card className="mb-6 p-5">
      <CardHead title="AI: Rex and Peggy" sub="Add the keys in Vercel → Settings → Environment Variables, redeploy, then check here." />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {keys.map((key) => (
          <div key={key.env} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-app-line px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-extrabold">{key.name}{key.on && key.primary && claude && openai ? <span className="font-semibold text-app-ink-soft"> · tried first</span> : null}</div>
              <code className="font-mono text-[12px] text-app-ink-soft">{key.env}</code>
            </div>
            {key.on ? <Pill tone="success" dot>Key added</Pill> : <Pill tone="warning" dot>Not set</Pill>}
          </div>
        ))}
      </div>
      <p className="m-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">
        One key is enough for chatting, building stores and writing; with both, if one fails the other takes over. Pictures, logos and voice typing need the OpenAI key.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PillButton size="sm" busy={busy} disabled={!claude && !openai} onClick={check}>{busy ? "Checking…" : "Check AI"}</PillButton>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
          <input type="checkbox" checked={images} onChange={(event) => setImages(event.target.checked)} disabled={!openai} />
          Test pictures too (about 1 US cent)
        </label>
      </div>

      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      {rows && (
        <ul className="m-0 mt-4 grid list-none gap-2 p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-[14px] bg-app-canvas px-3.5 py-3">
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="text-[14px] font-extrabold">{row.label}</div>
                <div className="break-words text-[12.5px] leading-[1.45] text-app-ink-soft">
                  {row.detail}
                  {row.ms != null && row.status !== "skipped" ? ` · ${(row.ms / 1000).toFixed(1)}s` : ""}
                </div>
                <code className="font-mono text-[11.5px] text-app-ink-faint">{row.model}</code>
              </div>
              <Pill tone={TONE[row.status]} dot>{WORD[row.status]}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
