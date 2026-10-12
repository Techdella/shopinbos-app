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
import { DETAIL_LABEL, categoryLabel, friendlyName, fromFriendly, plainProblem, plainRejection, toFriendly } from "../_kit/friendly";
import { AdvancedFold } from "@/components/simple/Fold";
import type { TemplateVariable } from "@/lib/marketing/text-channels";

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
      return `Up to date: ${result.total} message${result.total === 1 ? "" : "s"} on your WhatsApp${result.added ? `, ${result.added} new here` : ""}.`;
    });

  const submit = (id: string) =>
    run(`submit:${id}`, async () => {
      const row = await api<Row>(`/api/app/marketing/whatsapp-templates/${id}`, "POST", { action: "submit" });
      await refresh();
      return row.status === "APPROVED" ? `${friendlyName(row.name)} is approved and ready to use.` : `${friendlyName(row.name)} is waiting for WhatsApp to approve it (usually a few minutes). Tap "Check for updates" to see the answer.`;
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
      return `${friendlyName(submitted.name)} is waiting for WhatsApp to approve it (usually a few minutes).`;
    });

  const remove = (row: Row) => {
    if (!window.confirm(`Delete ${friendlyName(row.name)}?${row.status !== "DRAFT" ? " It's deleted from your WhatsApp too." : ""}`)) return;
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
          <ChannelHelp label="Connect WhatsApp first" howTo="You can write messages now and send them to WhatsApp for approval once it's connected." href={whatsapp.connectHref} linkLabel={whatsapp.connectLabel ?? "Connect WhatsApp"} />
        </Notice>
      ) : null}

      <Card className="p-5">
        <CardHead
          title="Your messages"
          sub={connected ? `Sending from ${whatsapp.via}` : "Write them now and send them for approval once WhatsApp is connected."}
          action={
            <div className="flex flex-wrap gap-2">
              <PillButton size="sm" tone="white" busy={busy === "sync"} onClick={() => void sync()} disabled={!connected}>Check for updates</PillButton>
              <PillButton size="sm" onClick={() => setEditing(blank())}>New message</PillButton>
            </div>
          }
        />
        {rows.length ? (
          <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="min-w-0 flex-1 basis-[240px]">
                  <span className="block truncate text-[15px] font-bold">{friendlyName(row.name)}</span>
                  <span className="block truncate text-[13px] text-app-ink-soft">
                    {categoryLabel(row.category)}{row.language !== "en" ? ` · ${TEMPLATE_LANGUAGES.find((l) => l.code === row.language)?.label ?? "Other language"}` : ""}
                  </span>
                  {row.rejectedReason ? <span className="mt-1 block text-[13px] font-semibold text-app-danger">{row.status === "REJECTED" ? "WhatsApp said no: " : "WhatsApp says: "}{plainRejection(row.rejectedReason)}</span> : null}
                </span>
                <TemplateStatusPill status={row.status} />
                <span className="flex flex-wrap gap-1.5">
                  {row.status === "DRAFT" || row.status === "REJECTED" || row.status === "LOCAL_ERROR" ? (
                    <>
                      <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: false })}>Edit</button>
                      <PillButton size="sm" busy={busy === `submit:${row.id}`} onClick={() => void submit(row.id)} disabled={!connected}>Send for approval</PillButton>
                    </>
                  ) : (
                    <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: true })}>Customer details</button>
                  )}
                  <button type="button" className={buttonClass("danger", "sm")} onClick={() => remove(row)} disabled={busy === `delete:${row.id}`}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState icon="whatsapp" title="No messages yet">Start from a ready-made one below, or write your own.</EmptyState>
          </div>
        )}
      </Card>

      <section aria-label="Ready-made messages" className="grid gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">Ready-made messages</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_PRESETS.map((preset) => (
            <Card key={preset.key} className="grid content-start gap-3 p-4">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <strong className="block text-[15px]">{preset.title}</strong>
                  <span className="block text-[12.5px] text-app-ink-soft">{preset.description}</span>
                </span>
                <Pill tone={preset.category === "UTILITY" ? "info" : "accent"}>{categoryLabel(preset.category)}</Pill>
              </div>
              <WhatsAppBubble content={preset.content} mapping={preset.variables} />
              <div className="flex flex-wrap gap-2">
                <PillButton size="sm" busy={busy === `preset:${preset.key}`} onClick={() => void addPreset(preset.key, true)} disabled={!connected}>
                  {usedPresets.has(preset.key) ? "Use it again" : "Use this message"}
                </PillButton>
                <button type="button" className={buttonClass("white", "sm")} onClick={() => void addPreset(preset.key, false)}>Change the words first</button>
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

const CHIPS: TemplateVariable[] = ["first_name", "store_name", "discount_code", "link", "product_name", "order_number", "order_total", "tracking_link"];

function TemplateEditor({ draft: initial, connected, onClose, onSaved }: { draft: Draft; connected: boolean; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const [friendly, setFriendly] = useState(() => toFriendly(initial.content.body, initial.variables));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const content = draft.content;
  const setContent = (patch: Partial<TemplateContent>) => setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }));
  const count = variableCount(content);
  // The name is only an internal label for WhatsApp: made from the first words when the seller leaves it empty.
  const autoName = draft.name || templateName(friendly.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).slice(0, 4).join("_")).slice(0, 40) || "my_message";
  const problems = useMemo(() => templateProblems({ name: autoName, category: draft.category, language: draft.language, content, variables: draft.variables }).map(plainProblem), [draft, content, autoName]);
  const hasStop = content.buttons.some((b) => b.type === "QUICK_REPLY" && /stop/i.test(b.text));
  const urlButton = content.buttons.find((b) => b.type === "URL") ?? null;

  /** The seller edits plain text with [Customer's first name]; WhatsApp gets {{1}} and the mapping. */
  function setText(text: string) {
    setFriendly(text);
    const { body, variables } = fromFriendly(text);
    setDraft((d) => ({ ...d, variables, content: { ...d.content, body } }));
  }

  function insertDetail(key: TemplateVariable) {
    const token = `[${DETAIL_LABEL[key]}]`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? friendly.length;
    const end = el?.selectionEnd ?? friendly.length;
    const before = friendly.slice(0, start);
    const pad = before && !/\s$/.test(before) ? " " : "";
    setText(before + pad + token + friendly.slice(end));
  }

  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "save");
    setError(null);
    try {
      const body = { name: autoName, language: draft.language, category: draft.category, content, variables: draft.variables.slice(0, count) };
      const saved = draft.id ? await api<{ id: string; name: string }>(`/api/app/marketing/whatsapp-templates/${draft.id}`, "PATCH", body) : await api<{ id: string; name: string }>("/api/app/marketing/whatsapp-templates", "POST", { action: "create", ...body });
      if (submit) {
        await api(`/api/app/marketing/whatsapp-templates/${saved.id}`, "POST", { action: "submit" });
        await onSaved(`${friendlyName(saved.name)} is waiting for WhatsApp to approve it (usually a few minutes).`);
      } else {
        await onSaved(draft.locked ? "Saved." : `${friendlyName(saved.name)} saved. Send it for approval when you're ready.`);
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
      setFriendly(toFriendly(result.content.body, result.variables));
      setNote(result.ai ? "Peggy wrote this. Check the words before you send it for approval." : "Peggy's writing help isn't available right now, so this is the closest ready-made message.");
    } catch (askError) {
      setError(errorText(askError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={draft.locked ? `${friendlyName(draft.name)}: customer details` : draft.id ? "Change message" : "New WhatsApp message"} onClose={onClose} wide>
      <div className="grid gap-4">
        {error ? <Notice>{error}</Notice> : null}
        {draft.locked ? (
          <p className="m-0 text-[14px] text-app-ink-soft">WhatsApp has approved these words, so they can&apos;t change here. You can change which customer detail goes in each gap.</p>
        ) : (
          <>
            <div className="grid gap-2 rounded-[18px] bg-app-canvas p-3">
              <label htmlFor="t-ask" className="text-[14px] font-bold">Ask Peggy to write it</label>
              <div className="flex flex-wrap gap-2">
                <input id="t-ask" value={ask} onChange={(e) => setAsk(e.target.value)} className={`${inputClass} min-w-[200px] flex-1`} placeholder="e.g. weekend sale with a discount code" maxLength={600} />
                <PillButton size="md" tone="white" busy={busy === "ask"} disabled={ask.trim().length < 3} onClick={() => void askPeggy()}>Write it</PillButton>
              </div>
              {note ? <p className="m-0 text-[13px] text-app-ink-soft">{note}</p> : null}
            </div>
            <Field label="What is this message for?" hint={draft.category === "UTILITY" ? "Only about one order (confirmed, on its way, delivered). No offers, or WhatsApp changes it to a promotion." : "Offers, new arrivals, reminders. Only goes to customers who said yes to offers on WhatsApp."}>
              <Segmented
                options={[{ value: "MARKETING", label: "Promotion" }, { value: "UTILITY", label: "Order update" }]}
                value={draft.category}
                onChange={(category) => setDraft((d) => ({ ...d, category, content: { ...d.content, buttons: category === "MARKETING" ? (d.content.buttons.some((b) => /stop/i.test(b.text)) ? d.content.buttons : [...d.content.buttons, STOP].slice(0, 3)) : d.content.buttons.filter((b) => !/stop promotions/i.test(b.text)) } }))}
              />
            </Field>
            <Field label="Message" htmlFor="t-body" hint="Tap a button below to add something that changes for each customer, like their name.">
              <textarea ref={bodyRef} id="t-body" rows={5} value={friendly} onChange={(e) => setText(e.target.value)} className={textareaClass} maxLength={1024} placeholder="Hi [Customer's first name], our weekend sale starts now. Use code [Discount code] when you pay." />
            </Field>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add a customer detail">
              {CHIPS.map((key) => (
                <button key={key} type="button" className={buttonClass("white", "sm")} onClick={() => insertDetail(key)}>+ {DETAIL_LABEL[key]}</button>
              ))}
            </div>
            <AdvancedFold label="More options (optional)" hint="Name, language, title, picture, small print and buttons">
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name (only you see it)" htmlFor="t-name">
                    <input id="t-name" value={draft.name.replace(/_/g, " ")} onChange={(e) => setDraft({ ...draft, name: templateName(e.target.value.replace(/\s+/g, "_")) })} className={inputClass} placeholder={autoName.replace(/_/g, " ")} maxLength={60} />
                  </Field>
                  <Field label="Language" htmlFor="t-lang">
                    <select id="t-lang" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className={selectClass}>
                      {TEMPLATE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Title at the top">
                  <div className="grid gap-2">
                    <Segmented
                      options={[{ value: "NONE", label: "None" }, { value: "TEXT", label: "Words" }, { value: "IMAGE", label: "Picture" }]}
                      value={content.header.format}
                      onChange={(format) => setContent({ header: { format, ...(format === "TEXT" ? { text: content.header.text ?? "" } : {}) } })}
                    />
                    {content.header.format === "TEXT" ? <input aria-label="Title" value={content.header.text ?? ""} onChange={(e) => setContent({ header: { format: "TEXT", text: e.target.value } })} className={inputClass} maxLength={60} placeholder="e.g. Order confirmed" /> : null}
                    {content.header.format === "IMAGE" ? <p className="m-0 text-[13px] text-app-ink-soft">You pick the picture (or a product) each time you send. WhatsApp checks it with a photo from your shop.</p> : null}
                  </div>
                </Field>
                <Field label="Small print at the bottom" htmlFor="t-footer">
                  <input id="t-footer" value={content.footer ?? ""} onChange={(e) => setContent({ footer: e.target.value })} className={inputClass} maxLength={60} placeholder="e.g. Not interested? Tap Stop promotions" />
                </Field>
                <div className="grid gap-2">
                  <span className="text-[14px] font-bold">Buttons</span>
                  <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                    <input type="checkbox" checked={hasStop} onChange={(e) => setContent({ buttons: e.target.checked ? [...content.buttons, STOP].slice(0, 3) : content.buttons.filter((b) => !(b.type === "QUICK_REPLY" && /stop/i.test(b.text))) })} className="h-[18px] w-[18px]" />
                    “Stop promotions” button (recommended for promotions; customers who tap it get no more offers)
                  </label>
                  <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                    <input type="checkbox" checked={Boolean(urlButton)} onChange={(e) => setContent({ buttons: e.target.checked ? [...content.buttons, { type: "URL" as const, text: "Visit shop", url: "https://" }].slice(0, 3) : content.buttons.filter((b) => b.type !== "URL") })} className="h-[18px] w-[18px]" />
                    Link button
                  </label>
                  {urlButton ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label="Button words" value={urlButton.text} onChange={(e) => setContent({ buttons: content.buttons.map((b) => (b.type === "URL" ? { ...b, text: e.target.value.slice(0, 25) } : b)) })} className={inputClass} />
                      <input aria-label="Button link" value={urlButton.url ?? ""} onChange={(e) => setContent({ buttons: content.buttons.map((b) => (b.type === "URL" ? { ...b, url: e.target.value.trim() } : b)) })} className={inputClass} placeholder="https://yourshop.shopinbos.com" />
                    </div>
                  ) : null}
                </div>
              </div>
            </AdvancedFold>
          </>
        )}
        {count && (draft.locked || draft.variables.some((v) => !v)) ? (
          <div className="grid gap-2">
            <span className="text-[14px] font-bold">Which customer detail goes in each gap</span>
            <VariableMapper template={{ id: "", name: draft.name, language: draft.language, category: draft.category, status: "DRAFT", rejectedReason: null, content, variables: draft.variables }} value={draft.variables} onChange={(variables) => { setDraft({ ...draft, variables }); setFriendly(toFriendly(content.body, variables)); }} />
          </div>
        ) : null}
        <div className="grid gap-2">
          <span className="text-[14px] font-bold">What the customer sees</span>
          <WhatsAppBubble content={content} mapping={draft.variables} />
        </div>
        {!draft.locked && problems.length ? (
          <ul className="m-0 grid list-disc gap-1 pl-5 text-[14px] text-app-accent-ink">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" tone={draft.locked ? "ink" : "white"} busy={busy === "save"} onClick={() => void save(false)} disabled={!draft.locked && problems.length > 0}>
            {draft.locked ? "Save" : "Save for later"}
          </PillButton>
          {!draft.locked ? (
            <PillButton size="md" busy={busy === "submit"} onClick={() => void save(true)} disabled={problems.length > 0 || !connected}>Send to WhatsApp for approval</PillButton>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
