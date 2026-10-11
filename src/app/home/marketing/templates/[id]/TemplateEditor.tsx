"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, SplitLayout } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Field, inputClass, selectClass } from "@/components/growth/kit";
import { EmailComposer } from "../../_kit/EmailComposer";
import { EmailPreview, api, errorText } from "../../_kit/client";

const KINDS = [
  ["marketing", "Marketing"],
  ["newsletter", "Newsletter"],
  ["promotion", "Sale or offer"],
  ["product_launch", "New arrivals"],
  ["announcement", "Announcement"],
  ["welcome", "Welcome"],
  ["abandoned_cart", "Cart reminder"],
  ["order", "Order"],
] as const;

export function TemplateEditor({ initial }: { initial: { id: string | null; name: string; subject: string; bodyHtml: string; category: string } }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await api<{ id: string }>("/api/app/marketing/templates", "POST", { id: draft.id, name: draft.name, subject: draft.subject, bodyHtml: draft.bodyHtml, category: draft.category });
      if (!draft.id) router.replace(`/home/marketing/templates/${saved.id}`);
      setDraft((d) => ({ ...d, id: saved.id }));
      setNotice("Template saved.");
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!draft.id || !window.confirm(`Delete "${draft.name}"? Campaigns already written with it keep their content.`)) return;
    setBusy("delete");
    try {
      await api(`/api/app/marketing/templates/${draft.id}`, "DELETE");
      router.push("/home/marketing/templates");
    } catch (deleteError) {
      setError(errorText(deleteError));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <SplitLayout
        sideWidth="460px"
        main={
          <Card className="grid gap-4 p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Template name" htmlFor="t-name"><input id="t-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} maxLength={120} /></Field>
              <Field label="Subject" htmlFor="t-subject"><input id="t-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={inputClass} maxLength={200} /></Field>
              <Field label="Kind" htmlFor="t-kind">
                <select id="t-kind" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={selectClass}>
                  {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>
            <EmailComposer value={draft.bodyHtml} onChange={(bodyHtml) => setDraft((d) => ({ ...d, bodyHtml }))} />
            <div className="flex flex-wrap gap-2 border-t border-app-line pt-4">
              <PillButton size="md" busy={busy === "save"} onClick={() => void save()}>Save template</PillButton>
              {draft.id ? <PillButton size="md" tone="white" onClick={() => router.push(`/home/marketing/campaigns/new?template=${draft.id}`)}>Use in a campaign</PillButton> : null}
              {draft.id ? <PillButton size="md" tone="white" className="text-app-danger sm:ml-auto" busy={busy === "delete"} onClick={() => void remove()}>Delete</PillButton> : null}
            </div>
          </Card>
        }
        side={
          <Card className="p-5">
            <CardHead title="Preview" />
            <div className="mt-3"><EmailPreview bodyHtml={draft.bodyHtml} subject={draft.subject} /></div>
          </Card>
        }
      />
    </div>
  );
}
