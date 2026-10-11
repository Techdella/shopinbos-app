"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Pill } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  type: "manual" | "auto";
  rules: string;
  subscriberCount: number;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  }
}

function SegmentEditor({ editing, onClose, onSaved }: { editing: Segment | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: editing?.name ?? "", description: editing?.description ?? "", type: editing?.type ?? ("manual" as Segment["type"]), rules: editing?.rules ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    let rules: Record<string, unknown> = {};
    if (form.type === "auto" && form.rules.trim()) {
      try {
        const parsed = JSON.parse(form.rules);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        rules = parsed;
      } catch {
        setError("The rules need to be a JSON object, like the example.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await send(editing ? `/api/store/segments/${editing.id}` : "/api/store/segments", editing ? "PATCH" : "POST", {
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        rules,
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save this segment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${editing.name}` : "New segment"} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <Field label="Name" htmlFor="seg-name">
          <input id="seg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required maxLength={120} placeholder="e.g. Repeat buyers" />
        </Field>
        <Field label="Description (optional)" htmlFor="seg-desc">
          <textarea id="seg-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={textareaClass} rows={2} maxLength={500} />
        </Field>
        <Field label="How people get in" htmlFor="seg-type">
          <select id="seg-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Segment["type"] })} className={selectClass}>
            <option value="manual">I add them by hand</option>
            <option value="auto">Automatically, by rules</option>
          </select>
        </Field>
        {form.type === "auto" && (
          <Field label="Rules (JSON)" htmlFor="seg-rules" hint="For example: at least 3 orders and ₦10,000 spent.">
            <textarea
              id="seg-rules"
              value={form.rules}
              onChange={(e) => setForm({ ...form, rules: e.target.value })}
              className={`${textareaClass} font-mono text-[13px]`}
              rows={5}
              placeholder={JSON.stringify({ minOrders: 3, minSpent: 10000, period: "all" }, null, 2)}
            />
          </Field>
        )}
        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving}>{editing ? "Save changes" : "Create segment"}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

export function SegmentsManager({ segments }: { segments: Segment[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ editing: Segment | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(segment: Segment) {
    if (!window.confirm(`Delete "${segment.name}"?`)) return;
    setError(null);
    try {
      await send(`/api/store/segments/${segment.id}`, "DELETE");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Couldn't delete this segment.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <PillButton size="md" tone="accent" onClick={() => setEditor({ editing: null })}><Icon name="plus" size={16} /> New segment</PillButton>
      </div>
      {error && <Notice>{error}</Notice>}

      {segments.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {segments.map((segment) => (
            <Card key={segment.id} as="article" className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 min-w-0 break-words text-[17px] font-extrabold">{segment.name}</h2>
                <Pill tone={segment.type === "auto" ? "info" : "muted"}>{segment.type === "auto" ? "Automatic" : "By hand"}</Pill>
              </div>
              {segment.description && <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{segment.description}</p>}
              <div className="text-[14px] font-bold">{segment.subscriberCount.toLocaleString("en-NG")} subscriber{segment.subscriberCount === 1 ? "" : "s"}</div>
              <div className="mt-auto flex gap-2 pt-1">
                <button type="button" onClick={() => setEditor({ editing: segment })} className={buttonClass("white", "sm")}>Edit</button>
                <button type="button" onClick={() => void remove(segment)} className={buttonClass("danger", "sm")}>Delete</button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon="layers" title="No segments yet" action={<PillButton size="md" onClick={() => setEditor({ editing: null })}>New segment</PillButton>}>
          Segments let you send a campaign to just your repeat buyers, big spenders or a list you pick.
        </EmptyState>
      )}

      {editor && (
        <SegmentEditor
          editing={editor.editing}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
