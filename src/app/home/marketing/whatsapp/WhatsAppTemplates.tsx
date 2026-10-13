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
import { useT } from "@/components/i18n/I18nProvider";

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
  const t = useT("marketing", "common");
  const category = (value: string) => t.dynamic(`wa.category.${value}`, categoryLabel(value));
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
      return `${t("wa.synced", { count: result.total })}${result.added ? t("wa.syncedNew", { count: result.added }) : ""}.`;
    });

  const submit = (id: string) =>
    run(`submit:${id}`, async () => {
      const row = await api<Row>(`/api/app/marketing/whatsapp-templates/${id}`, "POST", { action: "submit" });
      await refresh();
      return row.status === "APPROVED" ? t("wa.approvedReady", { name: friendlyName(row.name) }) : t("wa.waitingCheck", { name: friendlyName(row.name) });
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
      return t("wa.waiting", { name: friendlyName(submitted.name) });
    });

  const remove = (row: Row) => {
    if (!window.confirm(`${t("wa.confirmDelete", { name: friendlyName(row.name) })}${row.status !== "DRAFT" ? ` ${t("wa.deletedFromWhatsApp")}` : ""}`)) return;
    void run(`delete:${row.id}`, async () => {
      await api(`/api/app/marketing/whatsapp-templates/${row.id}`, "DELETE");
      await refresh();
      return t("wa.deleted");
    });
  };

  const usedPresets = new Set(rows.map((r) => r.preset).filter(Boolean));

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {!connected ? (
        <Notice tone="info">
          <ChannelHelp label={t("editor.connectWhatsApp")} howTo={t("wa.connectHow")} href={whatsapp.connectHref} linkLabel={whatsapp.connectLabel ?? t("wa.connect")} />
        </Notice>
      ) : null}

      <Card className="p-5">
        <CardHead
          title={t("editor.yourTemplates")}
          sub={connected ? t("wa.sendingFrom", { via: whatsapp.via ?? "" }) : t("wa.writeNow")}
          action={
            <div className="flex flex-wrap gap-2">
              <PillButton size="sm" tone="white" busy={busy === "sync"} onClick={() => void sync()} disabled={!connected}>{t("wa.checkUpdates")}</PillButton>
              <PillButton size="sm" onClick={() => setEditing(blank())}>{t("wa.newTemplate")}</PillButton>
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
                    {category(row.category)}{row.language !== "en" ? ` · ${TEMPLATE_LANGUAGES.find((l) => l.code === row.language)?.label ?? t("wa.otherLanguage")}` : ""}
                  </span>
                  {row.rejectedReason ? <span className="mt-1 block text-[13px] font-semibold text-app-danger">{row.status === "REJECTED" ? t("wa.saidNo") : t("wa.says")} {plainRejection(row.rejectedReason)}</span> : null}
                </span>
                <TemplateStatusPill status={row.status} />
                <span className="flex flex-wrap gap-1.5">
                  {row.status === "DRAFT" || row.status === "REJECTED" || row.status === "LOCAL_ERROR" ? (
                    <>
                      <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: false })}>{t("edit")}</button>
                      <PillButton size="sm" busy={busy === `submit:${row.id}`} onClick={() => void submit(row.id)} disabled={!connected}>{t("wa.sendForApproval")}</PillButton>
                    </>
                  ) : (
                    <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditing({ id: row.id, name: row.name, language: row.language, category: row.category as TemplateCategory, content: row.content, variables: row.variables, locked: true })}>{t("wa.customerDetails")}</button>
                  )}
                  <button type="button" className={buttonClass("danger", "sm")} onClick={() => remove(row)} disabled={busy === `delete:${row.id}`}>{t("delete")}</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState icon="whatsapp" title={t("wa.noTemplates")}>{t("wa.noTemplatesBody")}</EmptyState>
          </div>
        )}
      </Card>

      <section aria-label={t("wa.readyMade")} className="grid gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">{t("wa.readyMade")}</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_PRESETS.map((preset) => (
            <Card key={preset.key} className="grid content-start gap-3 p-4">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <strong className="block text-[15px]">{t.dynamic(`wa.preset.${preset.key}.title`, preset.title)}</strong>
                  <span className="block text-[12.5px] text-app-ink-soft">{t.dynamic(`wa.preset.${preset.key}.description`, preset.description)}</span>
                </span>
                <Pill tone={preset.category === "UTILITY" ? "info" : "accent"}>{category(preset.category)}</Pill>
              </div>
              <WhatsAppBubble content={preset.content} mapping={preset.variables} />
              <div className="flex flex-wrap gap-2">
                <PillButton size="sm" busy={busy === `preset:${preset.key}`} onClick={() => void addPreset(preset.key, true)} disabled={!connected}>
                  {usedPresets.has(preset.key) ? t("wa.useAgain") : t("wa.useThis")}
                </PillButton>
                <button type="button" className={buttonClass("white", "sm")} onClick={() => void addPreset(preset.key, false)}>{t("wa.changeFirst")}</button>
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
  const t = useT("marketing", "common");
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
        await onSaved(t("wa.waiting", { name: friendlyName(saved.name) }));
      } else {
        await onSaved(draft.locked ? t("editor.saved") : t("wa.savedLater", { name: friendlyName(saved.name) }));
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
      setNote(result.ai ? t("wa.peggyWrote") : t("wa.peggyOffline"));
    } catch (askError) {
      setError(errorText(askError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={draft.locked ? t("wa.lockedTitle", { name: friendlyName(draft.name) }) : draft.id ? t("wa.editTemplate") : t("wa.newTemplate")} onClose={onClose} wide>
      <div className="grid gap-4">
        {error ? <Notice>{error}</Notice> : null}
        {draft.locked ? (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("wa.lockedNote")}</p>
        ) : (
          <>
            <div className="grid gap-2 rounded-[18px] bg-app-canvas p-3">
              <label htmlFor="t-ask" className="text-[14px] font-bold">{t("wa.askPeggy")}</label>
              <div className="flex flex-wrap gap-2">
                <input id="t-ask" value={ask} onChange={(e) => setAsk(e.target.value)} className={`${inputClass} min-w-[200px] flex-1`} placeholder={t("wa.askPlaceholder")} maxLength={600} />
                <PillButton size="md" tone="white" busy={busy === "ask"} disabled={ask.trim().length < 3} onClick={() => void askPeggy()}>{t("wa.writeIt")}</PillButton>
              </div>
              {note ? <p className="m-0 text-[13px] text-app-ink-soft">{note}</p> : null}
            </div>
            <Field label={t("wa.whatFor")} hint={draft.category === "UTILITY" ? t("wa.utilityHint") : t("wa.marketingHint")}>
              <Segmented
                options={[{ value: "MARKETING", label: t("wa.category.MARKETING") }, { value: "UTILITY", label: t("wa.category.UTILITY") }]}
                value={draft.category}
                onChange={(category) => setDraft((d) => ({ ...d, category, content: { ...d.content, buttons: category === "MARKETING" ? (d.content.buttons.some((b) => /stop/i.test(b.text)) ? d.content.buttons : [...d.content.buttons, STOP].slice(0, 3)) : d.content.buttons.filter((b) => !/stop promotions/i.test(b.text)) } }))}
              />
            </Field>
            <Field label={t("wa.message")} htmlFor="t-body" hint={t("wa.messageHint")}>
              <textarea ref={bodyRef} id="t-body" rows={5} value={friendly} onChange={(e) => setText(e.target.value)} className={textareaClass} maxLength={1024} placeholder={t("wa.messagePlaceholder")} />
            </Field>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("wa.addDetail")}>
              {CHIPS.map((key) => (
                <button key={key} type="button" className={buttonClass("white", "sm")} onClick={() => insertDetail(key)}>+ {DETAIL_LABEL[key]}</button>
              ))}
            </div>
            <AdvancedFold label={t("wa.moreOptions")} hint={t("wa.moreOptionsHint")}>
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t("wa.nameOnlyYou")} htmlFor="t-name">
                    <input id="t-name" value={draft.name.replace(/_/g, " ")} onChange={(e) => setDraft({ ...draft, name: templateName(e.target.value.replace(/\s+/g, "_")) })} className={inputClass} placeholder={autoName.replace(/_/g, " ")} maxLength={60} />
                  </Field>
                  <Field label={t("wa.language")} htmlFor="t-lang">
                    <select id="t-lang" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} className={selectClass}>
                      {TEMPLATE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={t("wa.titleTop")}>
                  <div className="grid gap-2">
                    <Segmented
                      options={[{ value: "NONE", label: t("editor.none") }, { value: "TEXT", label: t("wa.words") }, { value: "IMAGE", label: t("wa.picture") }]}
                      value={content.header.format}
                      onChange={(format) => setContent({ header: { format, ...(format === "TEXT" ? { text: content.header.text ?? "" } : {}) } })}
                    />
                    {content.header.format === "TEXT" ? <input aria-label={t("wa.title")} value={content.header.text ?? ""} onChange={(e) => setContent({ header: { format: "TEXT", text: e.target.value } })} className={inputClass} maxLength={60} placeholder={t("wa.titlePlaceholder")} /> : null}
                    {content.header.format === "IMAGE" ? <p className="m-0 text-[13px] text-app-ink-soft">{t("wa.pictureNote")}</p> : null}
                  </div>
                </Field>
                <Field label={t("wa.smallPrint")} htmlFor="t-footer">
                  <input id="t-footer" value={content.footer ?? ""} onChange={(e) => setContent({ footer: e.target.value })} className={inputClass} maxLength={60} placeholder={t("wa.smallPrintPlaceholder")} />
                </Field>
                <div className="grid gap-2">
                  <span className="text-[14px] font-bold">{t("wa.buttons")}</span>
                  <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                    <input type="checkbox" checked={hasStop} onChange={(e) => setContent({ buttons: e.target.checked ? [...content.buttons, STOP].slice(0, 3) : content.buttons.filter((b) => !(b.type === "QUICK_REPLY" && /stop/i.test(b.text))) })} className="h-[18px] w-[18px]" />
                    {t("wa.stopButton")}
                  </label>
                  <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                    <input type="checkbox" checked={Boolean(urlButton)} onChange={(e) => setContent({ buttons: e.target.checked ? [...content.buttons, { type: "URL" as const, text: "Visit shop", url: "https://" }].slice(0, 3) : content.buttons.filter((b) => b.type !== "URL") })} className="h-[18px] w-[18px]" />
                    {t("wa.linkButton")}
                  </label>
                  {urlButton ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input aria-label={t("wa.buttonWords")} value={urlButton.text} onChange={(e) => setContent({ buttons: content.buttons.map((b) => (b.type === "URL" ? { ...b, text: e.target.value.slice(0, 25) } : b)) })} className={inputClass} />
                      <input aria-label={t("wa.buttonLink")} value={urlButton.url ?? ""} onChange={(e) => setContent({ buttons: content.buttons.map((b) => (b.type === "URL" ? { ...b, url: e.target.value.trim() } : b)) })} className={inputClass} placeholder="https://yourshop.shopinbos.com" />
                    </div>
                  ) : null}
                </div>
              </div>
            </AdvancedFold>
          </>
        )}
        {count && (draft.locked || draft.variables.some((v) => !v)) ? (
          <div className="grid gap-2">
            <span className="text-[14px] font-bold">{t("wa.whichDetail")}</span>
            <VariableMapper template={{ id: "", name: draft.name, language: draft.language, category: draft.category, status: "DRAFT", rejectedReason: null, content, variables: draft.variables }} value={draft.variables} onChange={(variables) => { setDraft({ ...draft, variables }); setFriendly(toFriendly(content.body, variables)); }} />
          </div>
        ) : null}
        <div className="grid gap-2">
          <span className="text-[14px] font-bold">{t("wa.customerSees")}</span>
          <WhatsAppBubble content={content} mapping={draft.variables} />
        </div>
        {!draft.locked && problems.length ? (
          <ul className="m-0 grid list-disc gap-1 pl-5 text-[14px] text-app-accent-ink">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
          <PillButton size="md" tone={draft.locked ? "ink" : "white"} busy={busy === "save"} onClick={() => void save(false)} disabled={!draft.locked && problems.length > 0}>
            {draft.locked ? t("save") : t("wa.saveLater")}
          </PillButton>
          {!draft.locked ? (
            <PillButton size="md" busy={busy === "submit"} onClick={() => void save(true)} disabled={problems.length > 0 || !connected}>{t("wa.sendToWhatsApp")}</PillButton>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
