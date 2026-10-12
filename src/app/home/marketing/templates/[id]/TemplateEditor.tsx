"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Field, inputClass, selectClass } from "@/components/growth/kit";
import type { EmailBrand } from "@/lib/marketing/email-layout";
import type { PreviewShop } from "@/lib/marketing/preview";
import { TEMPLATE_CATEGORIES } from "@/lib/marketing/template-library";
import { EmailBuilder } from "../../_kit/EmailBuilder";
import { api, errorText } from "../../_kit/client";

interface Draft {
  id: string | null;
  name: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  category: string;
}

const KINDS: Array<[string, string]> = [["marketing", "Marketing"], ...Object.entries(TEMPLATE_CATEGORIES)];

export function TemplateEditor({ initial, brand, shop }: { initial: Draft; brand: EmailBrand; shop: PreviewShop }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== saved;

  async function save(): Promise<string | null> {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const name = draft.name.trim() || draft.subject.trim().slice(0, 60) || "Untitled email";
      const result = await api<{ id: string }>("/api/app/marketing/templates", "POST", { id: draft.id, name, subject: draft.subject, preheader: draft.preheader, bodyHtml: draft.bodyHtml, category: draft.category });
      const next = { ...draft, id: result.id, name };
      setDraft(next);
      setSaved(JSON.stringify(next));
      if (!draft.id) router.replace(`/home/marketing/templates/${result.id}`);
      setNotice("Saved.");
      return result.id;
    } catch (saveError) {
      setError(errorText(saveError));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ to: string }>("/api/app/marketing/templates/test", "POST", { subject: draft.subject, preheader: draft.preheader, bodyHtml: draft.bodyHtml });
      setNotice(`Test sent to ${result.to}. Customers got nothing.`);
    } catch (testError) {
      setError(errorText(testError));
    } finally {
      setBusy(null);
    }
  }

  async function useIn(where: "campaign" | "automation") {
    const id = dirty || !draft.id ? await save() : draft.id;
    if (!id) return;
    router.push(where === "campaign" ? `/home/marketing/campaigns/new?template=${id}` : "/home/automations");
  }

  async function remove() {
    if (!draft.id || !window.confirm(`Delete "${draft.name}"? Messages already written with it keep their words.`)) return;
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
    <div className="grid gap-4">
      <Card className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <Field label="Design name" htmlFor="t-name"><input id="t-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} maxLength={120} placeholder="Sallah sale" /></Field>
          <Field label="Kind" htmlFor="t-kind">
            <select id="t-kind" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={selectClass}>
              {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              {!KINDS.some(([value]) => value === draft.category) ? <option value={draft.category}>{draft.category}</option> : null}
            </select>
          </Field>
          <Field label="Subject line" htmlFor="t-subject" hint={`${draft.subject.length}/200. Short subjects (under 50) read best on phones.`}>
            <input id="t-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={inputClass} maxLength={200} placeholder="Our Sallah sale starts now" />
          </Field>
          <Field label="Preview text" htmlFor="t-pre" hint="The grey line inboxes show after the subject.">
            <input id="t-pre" value={draft.preheader} onChange={(e) => setDraft({ ...draft, preheader: e.target.value })} className={inputClass} maxLength={200} placeholder="15% off festive pieces this weekend" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-app-line pt-4">
          <PillButton size="md" busy={busy === "save"} onClick={() => void save()}>{dirty || !draft.id ? "Save template" : "Saved"}</PillButton>
          <PillButton size="md" tone="white" busy={busy === "test"} onClick={() => void sendTest()}><Icon name="send" size={15} /> Send me a test</PillButton>
          <PillButton size="md" tone="white" onClick={() => void useIn("campaign")}><Icon name="megaphone" size={15} /> Use in a message to customers</PillButton>
          <PillButton size="md" tone="white" onClick={() => void useIn("automation")}><Icon name="automation" size={15} /> Use in an automation</PillButton>
          {draft.id ? <PillButton size="md" tone="white" className="text-app-danger lg:ml-auto" busy={busy === "delete"} onClick={() => void remove()}>Delete</PillButton> : null}
        </div>
        {error ? <Notice>{error}</Notice> : null}
        {notice ? <Notice tone="success">{notice}</Notice> : null}
      </Card>

      <EmailBuilder
        content={{ subject: draft.subject, preheader: draft.preheader, bodyHtml: draft.bodyHtml }}
        onChange={(content) => setDraft((d) => ({ ...d, ...content }))}
        brand={brand}
        shop={shop}
      />
    </div>
  );
}
