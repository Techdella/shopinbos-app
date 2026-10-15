"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { STATUS_LABEL, TOPICS, topicLabel, type SupportStatus } from "@/lib/support/pure";
import { deskSelect } from "./ui";

// Saved replies (macros) for the support desk: list, add, edit, delete. Starter replies can be saved as the
// team's own with one click.

export interface MacroRow {
  id: string;
  title: string;
  body: string;
  topic: string | null;
  status: string | null;
  usageCount: number;
  starter?: boolean;
}

type Draft = { id: string | null; title: string; body: string; topic: string; status: string };
const EMPTY: Draft = { id: null, title: "", body: "", topic: "", status: "" };

export function MacroManager({ macros }: { macros: MacroRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const save = () => {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch(draft.id ? `/api/admin/support/macros/${draft.id}` : "/api/admin/support/macros", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, body: draft.body, topic: draft.topic || null, status: draft.status || null }),
      }).catch(() => null);
      if (!response?.ok) {
        const json = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(json?.error?.message ?? "That didn't save. Try again.");
        return;
      }
      setDraft(null);
      router.refresh();
    });
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog("Delete this saved reply?"))) return;
    startTransition(async () => {
      await fetch(`/api/admin/support/macros/${id}`, { method: "DELETE" }).catch(() => null);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      {draft ? (
        <section aria-label={draft.id ? "Edit saved reply" : "New saved reply"} className="rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_200px]">
            <div>
              <label htmlFor="macro-title" className="mb-1 block text-[13px] font-bold">Name</label>
              <input id="macro-title" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Payout timing" className="min-h-[44px] w-full rounded-[14px] border border-app-line px-3.5 text-[14.5px] outline-none focus:border-app-ink" />
            </div>
            <div>
              <label htmlFor="macro-topic" className="mb-1 block text-[13px] font-bold">Topic</label>
              <select id="macro-topic" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} className={cx(deskSelect, "w-full")}>
                <option value="">Any</option>
                {TOPICS.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="macro-status" className="mb-1 block text-[13px] font-bold">Then set status</label>
              <select id="macro-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={cx(deskSelect, "w-full")}>
                <option value="">Don&apos;t change</option>
                {(["pending", "solved", "open"] as SupportStatus[]).map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="macro-body" className="mb-1 mt-3 block text-[13px] font-bold">Reply</label>
          <textarea id="macro-body" value={draft.body} rows={7} maxLength={5000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="w-full resize-y rounded-[16px] border border-app-line px-4 py-3 text-[14.5px] leading-[1.55] outline-none focus:border-app-ink" />
          <p className="m-0 mt-1 text-[12.5px] text-app-ink-soft">
            Fills in: <code>{"{{first_name}}"}</code>, <code>{"{{name}}"}</code>, <code>{"{{ticket}}"}</code> (SB-1042), <code>{"{{agent}}"}</code> (your first name).
          </p>
          {error && <p role="alert" className="m-0 mt-3 rounded-[14px] bg-app-danger-tint px-4 py-2.5 text-[13.5px] font-semibold text-app-danger">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="min-h-[44px] rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white hover:bg-black disabled:opacity-55">
              {busy ? "Saving…" : "Save reply"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="min-h-[44px] rounded-full border border-app-line px-5 text-[14px] font-bold">Cancel</button>
          </div>
        </section>
      ) : (
        <div>
          <button type="button" onClick={() => setDraft(EMPTY)} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white hover:brightness-95">
            <Icon name="plus" size={15} /> New saved reply
          </button>
        </div>
      )}

      <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
        {macros.map((macro) => (
          <li key={macro.id} className="flex flex-col rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="m-0 min-w-0 flex-1 text-[15px] font-extrabold">{macro.title}</h2>
              {macro.starter ? (
                <span className="rounded-full bg-app-lilac px-2.5 py-1 text-[11.5px] font-bold text-app-ink-soft">Starter</span>
              ) : (
                <span className="text-[12px] text-app-ink-soft">Used {macro.usageCount}×</span>
              )}
            </div>
            <p className="m-0 line-clamp-5 whitespace-pre-wrap text-[13.5px] leading-[1.5] text-app-ink-soft">{macro.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-app-ink-soft">
              {macro.topic && <span>{topicLabel(macro.topic)}</span>}
              {macro.status && <span>· then {STATUS_LABEL[macro.status as SupportStatus]?.toLowerCase() ?? macro.status}</span>}
              <span className="flex-1" />
              {macro.starter ? (
                <button type="button" onClick={() => setDraft({ id: null, title: macro.title, body: macro.body, topic: macro.topic ?? "", status: macro.status ?? "" })} className="font-bold text-app-ink underline">
                  Save as ours
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setDraft({ id: macro.id, title: macro.title, body: macro.body, topic: macro.topic ?? "", status: macro.status ?? "" })} className="font-bold text-app-ink underline">Edit</button>
                  <button type="button" onClick={() => remove(macro.id)} disabled={busy} className="font-bold text-app-danger underline">Delete</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
