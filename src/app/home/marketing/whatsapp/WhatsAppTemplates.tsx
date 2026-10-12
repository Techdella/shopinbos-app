"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, EmptyState, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented } from "@/components/app-ui";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import type { ChannelStatus } from "@/lib/marketing/channels";
import {
  TEMPLATE_LANGUAGES,
  TEMPLATE_PRESETS,
  templateName,
  templateProblems,
  variableCount,
  type TemplateButton,
  type TemplateCategory,
  type TemplateContent,
} from "@/lib/marketing/text-channels";
import { api, errorText } from "../_kit/client";
import { ChannelHelp, TemplateStatusPill, VariableMapper, WhatsAppBubble, type TemplateOption } from "../_kit/text";

type Row = TemplateOption & { preset: string | null; syncedAt: string | null };

interface Draft {
  id: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  content: TemplateContent;
  variables: string[];
  locked: boolean;
}

const blank = (): Draft => ({ id: null, name: "", language: "en", category: "MARKETING", content: { header: { format: "NONE" }, body: "", footer: "", buttons: [{ type: "QUICK_REPLY", text: "Stop promotions" }] }, variables: [], locked: false });

const STOP: TemplateButton = { type: "QUICK_REPLY", text: "Stop promotions" };

export function WhatsAppTemplates({ initial, whatsapp }: { initial: Row[]; whatsapp: ChannelStatus }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const connected = Boolean(whatsapp.templates);

  const refresh = async () => {
    const list = await api<Row[]>("/api/app/marketing/whatsapp-templates", "GET");
    setRows(list);
    router.refresh();
  };

  async function run(key: string, work: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const message = await work();
      if (message) setNotice(message);
    } catch (runError) {
      setError(errorText(runError));
    } finally {
      setBusy(null);
    }
  }

  const sync = () =>
    run("sync", async () => {
      const result = await api<{ updated: number; added: number; removed: number; total: number }>("/api/app/marketing/whatsapp-templates", "POST", { action: "sync" });
      await refresh();
      return `Synced with Meta: ${result.total} template${result.total === 1 ? "" : "s"} on your WhatsApp account${result.added ? `, ${result.added} new here` : ""}.`;
    });

  const submit = (id: string) =>
    run(`submit:${id}`, async () => {
      const row = await api<Row>(`/api/app/marketing/whatsapp-templates/${id}`, "POST", { action: "submit" });
      await refresh();
      return row.status === "APPROVED" ? `${row.name} is approved and ready to use.` : `${row.name} was sent to Meta for review. Sync in a few minutes to see the result.`;
    });

  const addPreset = (key: string, thenSubmit: boolean) =>
    run(`preset:${key}`, async () => {
      const row = await api<Row>("/api/app/marketing/whatsapp-templates", "POST", { action: "preset", key });
      if (!thenSubmit) {
        await refresh();
        setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: false });
        return;
      }
      const submitted = await api<Row>(`/api/app/marketing/whatsapp-templates/${row.id}`, "POST", { action: "submit" }).catch(async (submitError) => {
        await refresh();
        throw submitError;
      });
      await refresh();
      return `${submitted.name} was sent to Meta for review.`;
    });

  const remove = (row: Row) => {
    if (!window.confirm(`Delete ${row.name}?${row.status !== "DRAFT" ? " It's deleted from your WhatsApp account too." : ""}`)) return;
    void run(`delete:${row.id}`, async () => {
      await api(`/api/app/marketing/whatsapp-templates/${row.id}`, "DELETE");
      await refresh();
      return "Deleted.";
    });
  };

  const usedPresets = new Set(rows.map((r) => r.preset).filter(Boolean));

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {!connected ? (
        <Notice tone="info">
          <ChannelHelp label="WhatsApp isn't ready for templates" howTo={whatsapp.howTo} href={whatsapp.connectHref} linkLabel={whatsapp.connectLabel} />
        </Notice>
      ) : null}

      <Card className="p-5">
        <CardHead
          title="Your templates"
          sub={connected ? `Sending from ${whatsapp.via}` : "You can write drafts now and submit them once WhatsApp is connected."}
          action={
            <div className="flex flex-wrap gap-2">
              <PillButton size="sm" tone="white" busy={busy === "sync"} onClick={() => void sync()} disabled={!connected}>Sync with Meta</PillButton>
              <PillButton size="sm" onClick={() => setEditing(blank())}>New template</PillButton>
            </div>
          }
        />
        {rows.length ? (
          <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="min-w-0 flex-1 basis-[240px]">
                  <span className="block truncate font-mono text-[14px] font-bold">{row.name}</span>
                  <span className="block truncate text-[12.5px] text-app-ink-soft">
                    {row.category === "UTILITY" ? "Utility" : "Marketing"} · {TEMPLATE_LANGUAGES.find((l) => l.code === row.language)?.label ?? row.language} · {variableCount(row.content)} variable{variableCount(row.content) === 1 ? "" : "s"}
                  </span>
                  {row.rejectedReason ? <span className="mt-1 block text-[12.5px] font-semibold text-app-danger">{row.status === "REJECTED" ? "Meta's reason: " : ""}{row.rejectedReason.replace(/_/g, " ").toLowerCase()}</span> : null}
                </span>
                <TemplateStatusPill status={row.status} />
                <span className="flex flex-wrap gap-1.5">
                  {row.status === "DRAFT" || row.status === "REJECTED" || row.status === "LOCAL_ERROR" ? (
                    <>
                      <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: false })}>Edit</button>
                      <PillButton size="sm" busy={busy === `submit:${row.id}`} onClick={() => void submit(row.id)} disabled={!connected}>Submit to Meta</PillButton>
                    </>
                  ) : (
                    <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: true })}>Variables</button>
                  )}
                  <button type="button" className={buttonClass("danger", "sm")} onClick={() => remove(row)} disabled={busy === `delete:${row.id}`}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState icon="whatsapp" title="No templates yet">Start from a ready-made one below, or write your own.</EmptyState>
          </div>
        )}
      </Card>

      <section aria-label="Ready-made templates" className="grid gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">Ready-made templates</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_PRESETS.map((preset) => (
            <Card key={preset.key} className="grid content-start gap-3 p-4">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <strong className="block text-[15px]">{preset.title}</strong>
                  <span className="block text-[12.5px] text-app-ink-soft">{preset.description}</span>
                </span>
                <Pill tone={preset.category === "UTILITY" ? "info" : "accent"}>{preset.category === "UTILITY" ? "Utility" : "Marketing"}</Pill>
              </div>
              <WhatsAppBubble content={preset.content} mapping={preset.variables} />
              <div className="flex flex-wrap gap-2">
                <PillButton size="sm" busy={busy === `preset:${preset.key}`} onClick={() => void addPreset(preset.key, true)} disabled={!connected}>
                  {usedPresets.has(preset.key) ? "Submit another copy" : "Submit in one click"}
                </PillButton>
                <button type="button" className={buttonClass("white", "sm")} onClick={() => void addPreset(preset.key, false)}>Edit first</button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {editing ? (
        <TemplateEditor
          draft={editing}
          connected={connected}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            await refresh();
            setNotice(message);
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateEditor({ draft: initial, connected, onClose, onSaved }: { draft: Draft; connected: boolean; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const content = draft.content;
  const setContent = (patch: Partial<TemplateContent>) => setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }));
  const count = variableCount(content);
  const problems = useMemo(() => templateProblems({ name: draft.name, category: draft.category, language: draft.language, content, variables: draft.variables }), [draft, content]);
  const hasStop = content.buttons.some((b) => b.type === "QUICK_REPLY" && /stop/i.test(b.text));
  const urlButton = content.buttons.find((b) => b.type === "URL") ?? null;

  function insertVariable() {
    const n = count + 1;
    const token = `{{${n}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? content.body.length;
    const end = el?.selectionEnd ?? content.body.length;
    setContent({ body: content.body.slice(0, start) + token + content.body.slice(end) });
    setDraft((d) => ({ ...d, variables: [...d.variables.slice(0, n - 1), d.variables[n - 1] ?? ""] }));
  }

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "save");
    setError(null);
    try {
      const body = { name: draft.name, language: draft.language, category: draft.category, content, variables: draft.variables.slice(0, count) };
      const saved = draft.id ? await api<{ id: string; name: string }>(`/api/app/marketing/whatsapp-templates/${draft.id}`, "PATCH", body) : await api<{ id: string; name: string }>("/api/app/marketing/whatsapp-templates", "POST", { action: "create", ...body });
      if (submit) {
        await api(`/api/app/marketing/whatsapp-templates/${saved.id}`, "POST", { action: "submit" });
        await onSaved(`${saved.name} was sent to Meta for review.`);
      } else {
        await onSaved(draft.locked ? "Variables saved." : `${saved.name} saved as a draft.`);
      }
    } catch (saveError) {
      setError(errorText(saveError));
      setBusy(null);
    }
  }

  async function askPeggy() {
    setBusy("ask");
    setError(null);
    try {
      const result = await api<{ ai: boolean; name: string; category: TemplateCategory; content: TemplateContent; variables: string[] }>("/api/app/marketing/whatsapp-templates", "POST", { action: "assist", instruction: ask, category: draft.category });
      setDraft((d) => ({ ...d, name: d.name || result.name, category: result.category, content: { ...result.content, buttons: result.content.buttons ?? [] }, variables: result.variables }));
      setNote(result.ai ? "Peggy wrote this. Check the words and the variables before you submit." : "Peggy's writing help isn't available right now, so this is the closest ready-made template.");
    } catch (askError) {
      setError(errorText(askError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={draft.locked ? `${draft.name}: variables` : draft.id ? "Edit template" : "New template"} onClose={onClose} wide>
      <div className="grid gap-4">
        {error ? <Notice>{error}</Notice> : null}
        {draft.locked ? (
          <p className="m-0 text-[14px] text-app-ink-soft">Meta has this template, so its words can't change here. You can change what fills each variable by default.</p>
        ) : (
          <>
            <div className="grid gap-2 rounded-[18px] bg-app-canvas p-3">
              <label htmlFor="t-ask" className="text-[13.5px] font-bold">Ask Peggy to write it</label>
              <div className="flex flex-wrap gap-2">
                <input id="t-ask" value={ask} onChange={(e) => setAsk(e.target.value)} className={`${inputClass} min-w-[200px] flex-1`} placeholder="e.g. weekend sale with a discount code" maxLength={600} />
                <PillButton size="md" tone="white" busy={busy === "ask"} disabled={ask.trim().length < 3} onClick={() => void askPeggy()}>Write it</PillButton>
              </div>
              {note ? <p className="m-0 text-[12.5px] text-app-ink-soft">{note}</p> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" htmlFor="t-name" hint="Lowercase letters, numbers and underscores.">
                <input id="t-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: templateName(e.target.value) })} className={`${inputClass} font-mono`} placeholder="weekend_sale" maxLength={60} />
              </Field>
              <Field label="Language" htmlFor="t-lang">
                <select id="t-lang" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className={selectClass}>
                  {TEMPLATE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Type" hint={draft.category === "UTILITY" ? "Only about a specific order (confirmations, shipping, delivery). No offers, or Meta re-labels it Marketing." : "Offers, new arrivals, reminders. Only goes to people who said yes to WhatsApp offers."}>
              <Segmented
                options={[{ value: "MARKETING", label: "Marketing" }, { value: "UTILITY", label: "Utility (orders)" }]}
                value={draft.category}
                onChange={(category) => setDraft((d) => ({ ...d, category, content: { ...d.content, buttons: category === "MARKETING" ? (d.content.buttons.some((b) => /stop/i.test(b.text)) ? d.content.buttons : [...d.content.buttons, STOP].slice(0, 3)) : d.content.buttons.filter((b) => !/stop promotions/i.test(b.text)) } }))}
              />
            </Field>
            <Field label="Header">
              <div className="grid gap-2">
                <Segmented
                  options={[{ value: "NONE", label: "None" }, { value: "TEXT", label: "Text" }, { value: "IMAGE", label: "Picture" }]}
                  value={content.header.format}
                  onChange={(format) => setContent({ header: { format, ...(format === "TEXT" ? { text: content.header.text ?? "" } : {}) } })}
                />
                {content.header.format === "TEXT" ? <input aria-label="Header text" value={content.header.text ?? ""} onChange={(e) => setContent({ header: { format: "TEXT", text: e.target.value } })} className={inputClass} maxLength={60} placeholder="e.g. Order confirmed" /> : null}
                {content.header.format === "IMAGE" ? <p className="m-0 text-[12.5px] text-app-ink-soft">You pick the picture (or a product) each time you send. Meta reviews it with a sample photo from your shop.</p> : null}
              </div>
            </Field>
            <Field label="Message" htmlFor="t-body" hint="Use {{1}}, {{2}}… for details that change per person. Not at the very start or end.">
              <textarea ref={bodyRef} id="t-body" rows={5} value={content.body} onChange={(e) => setContent({ body: e.target.value })} className={textareaClass} maxLength={1024} placeholder="Hi {{1}}, our weekend sale at {{2}} starts now. Use code {{3}} at checkout." />
            </Field>
            <button type="button" className={`${buttonClass("white", "sm")} justify-self-start`} onClick={insertVariable}>Add variable {`{{${count + 1}}}`}</button>
            <Field label="Footer (optional)" htmlFor="t-footer">
              <input id="t-footer" value={content.footer ?? ""} onChange={(e) => setContent({ footer: e.target.value })} className={inputClass} maxLength={60} placeholder="e.g. Not interested? Tap Stop promotions" />
            </Field>
            <div className="grid gap-2">
              <span className="text-[13.5px] font-bold">Buttons</span>
              <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                <input type="checkbox" checked={hasStop} onChange={(e) => setContent({ buttons: e.target.checked ? [...content.buttons, STOP].slice(0, 3) : content.buttons.filter((b) => !(b.type === "QUICK_REPLY" && /stop/i.test(b.text))) })} className="h-[18px] w-[18px]" />
                “Stop promotions” button (recommended for marketing; tapping it opts them out here)
              </label>
              <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                <input type="checkbox" checked={Boolean(urlButton)} onChange={(e) => setContent({ buttons: e.target.checked ? [...content.buttons, { type: "URL" as const, text: "Visit shop", url: "https://" }].slice(0, 3) : content.buttons.filter((b) => b.type !== "URL") })} className="h-[18px] w-[18px]" />
                Link button
              </label>
              {urlButton ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input aria-label="Button label" value={urlButton.text} onChange={(e) => setContent({ buttons: content.buttons.map((b) => (b.type === "URL" ? { ...b, text: e.target.value.slice(0, 25) } : b)) })} className={inputClass} />
                  <input aria-label="Button link" value={urlButton.url ?? ""} onChange={(e) => setContent({ buttons: content.buttons.map((b) => (b.type === "URL" ? { ...b, url: e.target.value.trim() } : b)) })} className={inputClass} placeholder="https://yourshop.shopinbos.com" />
                </div>
              ) : null}
            </div>
          </>
        )}
        {count ? (
          <div className="grid gap-2">
            <span className="text-[13.5px] font-bold">What fills each variable</span>
            <VariableMapper template={{ id: "", name: draft.name, language: draft.language, category: draft.category, status: "DRAFT", rejectedReason: null, content, variables: draft.variables }} value={draft.variables} onChange={(variables) => setDraft({ ...draft, variables })} />
          </div>
        ) : null}
        <div className="grid gap-2">
          <span className="text-[13.5px] font-bold">Preview</span>
          <WhatsAppBubble content={content} mapping={draft.variables} />
        </div>
        {!draft.locked && problems.length ? (
          <ul className="m-0 grid list-disc gap-1 pl-5 text-[13px] text-app-accent-ink">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" tone={draft.locked ? "ink" : "white"} busy={busy === "save"} onClick={() => void save(false)} disabled={!draft.locked && problems.length > 0}>
            {draft.locked ? "Save" : "Save draft"}
          </PillButton>
          {!draft.locked ? (
            <PillButton size="md" busy={busy === "submit"} onClick={() => void save(true)} disabled={problems.length > 0 || !connected}>Save and submit</PillButton>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
