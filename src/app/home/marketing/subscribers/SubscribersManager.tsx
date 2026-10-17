"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, checkClass, formatDate, inputClass, selectClass } from "@/components/growth/kit";
import { api, errorText } from "../_kit/client";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
import { Pagination } from "@/components/seller/Pagination";
import type { PageParams } from "@/lib/pagination";

interface Row {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  source: string;
  sourceLabel: string;
  tags: string[];
  createdAt: string;
  consent: { email: boolean; text: boolean; at: string | null } | null;
  birthday: string | null;
}

const STATUS: Record<string, { tone: Tone; label: MessageKey<"marketing"> }> = {
  active: { tone: "success", label: "subs.status.active" },
  unsubscribed: { tone: "warning", label: "subs.status.unsubscribed" },
  bounced: { tone: "danger", label: "subs.status.bounced" },
  spam: { tone: "danger", label: "subs.status.spam" },
};

const COLUMN_LABEL: Record<string, MessageKey<"marketing">> = { email: "channel.email", name: "subs.col.name", first_name: "subs.col.firstName", last_name: "subs.col.lastName", phone: "subs.col.phone", country: "subs.col.location", tags: "subs.col.tags", birthday: "subs.col.birthday", ignore: "subs.col.skip" };

function AddPerson({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT("marketing", "common");
  const [form, setForm] = useState({ email: "", name: "", phone: "", birthday: "", tags: "", emailOk: false, textOk: false, note: "", welcome: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/app/marketing/subscribers", "POST", {
        email: form.email,
        name: form.name || null,
        phone: form.phone || null,
        birthday: form.birthday || null,
        tags: form.tags.split(",").map((tagName) => tagName.trim()).filter(Boolean),
        consent: { email: form.emailOk, sms: form.textOk, whatsapp: form.textOk, note: form.note || undefined },
        sendWelcome: form.welcome,
      });
      onDone();
    } catch (addError) {
      setError(errorText(addError));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t("subs.add.title")} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <Field label={t("channel.email")} htmlFor="add-email"><input id="add-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("subs.add.nameOptional")} htmlFor="add-name"><input id="add-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
          <Field label={t("subs.add.phoneOptional")} htmlFor="add-phone"><input id="add-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="0803…" /></Field>
          <Field label={t("subs.add.birthdayOptional")} htmlFor="add-bday" hint={t("subs.add.birthdayHint")}><input id="add-bday" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={inputClass} placeholder="DD/MM" /></Field>
          <Field label={t("subs.add.tagsOptional")} htmlFor="add-tags" hint={t("subs.add.tagsHint")}><input id="add-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputClass} placeholder="vip, lagos" /></Field>
        </div>
        <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={form.emailOk} onChange={(e) => setForm({ ...form, emailOk: e.target.checked })} /> {t("subs.add.emailOk")}</label>
        <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={form.textOk} onChange={(e) => setForm({ ...form, textOk: e.target.checked })} /> {t("subs.add.textOk")}</label>
        <Field label={t("subs.add.howAgreed")} htmlFor="add-note"><input id="add-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} placeholder={t("subs.add.howAgreedPlaceholder")} maxLength={300} /></Field>
        <label className="flex items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={form.welcome} onChange={(e) => setForm({ ...form, welcome: e.target.checked })} /> {t("subs.add.welcome")}</label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
          <PillButton size="md" type="submit" busy={busy} disabled={!form.emailOk}>{t("add")}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

function ImportCsv({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const t = useT("marketing", "common");
  const locale = useLocale();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{ columns: string[]; total: number; skipped: number; preview: Array<{ email: string; name: string | null; phone: string | null; tags: string[] }> } | null>(null);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [tag, setTag] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [textOk, setTextOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(text: string, cols: string[] | null) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<NonNullable<typeof preview>>("/api/app/marketing/subscribers/import", "POST", { csv: text, columns: cols ?? undefined, consent: { email: true }, dryRun: true });
      setPreview(data);
      setColumns(data.columns);
    } catch (checkError) {
      setPreview(null);
      setError(errorText(checkError));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) return setError(t("subs.import.tooBig"));
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    void check(text, null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ added: number; updated: number; failed: number; skipped: number }>("/api/app/marketing/subscribers/import", "POST", {
        csv,
        columns: columns ?? undefined,
        tags: tag ? [tag] : [],
        consent: { email: true, sms: textOk, whatsapp: textOk },
      });
      onDone(`${t("subs.import.done", { added: result.added, updated: result.updated })}${result.skipped ? t("subs.import.doneSkipped", { count: result.skipped }) : ""}${result.failed ? t("subs.import.doneFailed", { count: result.failed }) : ""}.`);
    } catch (runError) {
      setError(errorText(runError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("subs.import.title")} onClose={onClose} wide>
      <div className="grid gap-4">
        <p className="m-0 text-[14px] text-app-ink-soft">{t("subs.import.intro")}</p>
        <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-dashed border-app-line-strong px-4 text-[14px] font-bold hover:bg-app-canvas">
          <Icon name="upload" size={16} /> {fileName || t("subs.import.choose")}
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {preview && columns ? (
          <>
            <div className="overflow-x-auto rounded-[16px] border border-app-line">
              <table className="w-full min-w-[480px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {columns.map((column, index) => (
                      <th key={index} className="border-b border-app-line p-2 text-left">
                        <select
                          aria-label={t("subs.import.column", { n: index + 1 })}
                          className={`${selectClass} h-[38px] text-[13px]`}
                          value={column}
                          onChange={(e) => {
                            const next = columns.map((c, i) => (i === index ? e.target.value : c));
                            setColumns(next);
                            void check(csv, next);
                          }}
                        >
                          {Object.entries(COLUMN_LABEL).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
              <ul className="m-0 list-none divide-y divide-app-line p-0 text-[13px]">
                {preview.preview.map((row) => (
                  <li key={row.email} className="flex flex-wrap gap-x-3 px-3 py-2">
                    <strong className="min-w-0 truncate">{row.email}</strong>
                    <span className="text-app-ink-soft">{[row.name, row.phone, row.tags.join(", ")].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="m-0 text-[14px] font-bold">{t("subs.import.found", { count: preview.total })}{preview.skipped ? ` · ${t("subs.import.willSkip", { count: preview.skipped })}` : ""}</p>
            <Field label={t("subs.import.tagEveryone")} htmlFor="imp-tag"><input id="imp-tag" value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass} placeholder={t("subs.import.tagPlaceholder")} /></Field>
            <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> {t("subs.import.agreed")}</label>
            <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={textOk} onChange={(e) => setTextOk(e.target.checked)} /> {t("subs.add.textOk")}</label>
          </>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
          <PillButton size="md" busy={busy} disabled={!preview || !agreed} onClick={() => void run()}>{t("subs.import.importN", { n: preview ? formatNumber(preview.total, locale) : "" })}</PillButton>
        </div>
      </div>
    </Modal>
  );
}

export function SubscribersManager({
  rows,
  total,
  exportHref,
  tags,
  pagination,
}: {
  rows: Row[];
  total: number;
  exportHref: string;
  tags: string[];
  pagination: { page: number; pages: number; total: number; from: number; to: number; base: string; params: PageParams };
}) {
  const router = useRouter();
  const t = useT("marketing", "common");
  const locale = useLocale();
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<"add" | "import" | null>(null);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const allOnPage = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  async function bulk(action: "tag" | "untag" | "unsubscribe" | "delete") {
    if (action === "unsubscribe" && !(await confirmDialog(t("subs.bulk.confirmUnsub", { count: selected.length })))) return;
    if (action === "delete" && !(await confirmDialog(t("subs.bulk.confirmRemove", { count: selected.length })))) return;
    if ((action === "tag" || action === "untag") && !tag.trim()) return setError(t("subs.bulk.typeTag"));
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ updated: number; kept?: number }>("/api/app/marketing/subscribers/bulk", "POST", { ids: selected, action, tag: tag.trim() || undefined });
      setNotice(`${t(action === "tag" ? "subs.bulk.tagged" : action === "untag" ? "subs.bulk.untagged" : action === "unsubscribe" ? "subs.bulk.unsubscribed" : "subs.bulk.removed", { count: result.updated })}${result.kept ? ` ${t("subs.bulk.kept", { count: result.kept })}` : ""}`);
      setSelected([]);
      router.refresh();
    } catch (bulkError) {
      setError(errorText(bulkError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <PillButton size="md" tone="accent" onClick={() => setModal("add")}><Icon name="plus" size={16} /> {t("subs.add.title")}</PillButton>
        <PillButton size="md" tone="white" onClick={() => setModal("import")}><Icon name="upload" size={16} /> {t("subs.importCsv")}</PillButton>
        <a href={exportHref} className={buttonClass("white")} download><Icon name="download" size={16} /> {t("subs.exportCsv")}</a>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      {selected.length ? (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <strong className="px-2 text-[14px]">{t("subs.selected", { count: selected.length })}</strong>
          <input aria-label={t("subs.tag")} list="sub-tags" value={tag} onChange={(e) => setTag(e.target.value)} className={`${inputClass} h-[40px] w-[160px]`} placeholder={t("subs.tag")} />
          <datalist id="sub-tags">{tags.map((tagName) => <option key={tagName} value={tagName} />)}</datalist>
          <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => void bulk("tag")}>{t("subs.addTag")}</button>
          <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => void bulk("untag")}>{t("subs.removeTag")}</button>
          <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => void bulk("unsubscribe")}>{t("subs.unsubscribe")}</button>
          <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => void bulk("delete")}>{t("remove")}</button>
          <button type="button" className={buttonClass("ghost", "sm", "ml-auto")} onClick={() => setSelected([])}>{t("subs.clear")}</button>
        </Card>
      ) : null}

      {rows.length ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-app-line px-4 py-3 text-[13px] text-app-ink-soft sm:px-5">
            <input type="checkbox" aria-label={t("subs.selectPage")} className={checkClass} checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? rows.map((row) => row.id) : [])} />
            <span>{t("campaign.people", { count: total })}</span>
          </div>
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {rows.map((row) => {
              const status = STATUS[row.status] ?? STATUS.active;
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <input
                    type="checkbox"
                    aria-label={t("subs.selectRow", { email: row.email })}
                    className={checkClass}
                    checked={selected.includes(row.id)}
                    onChange={(e) => setSelected((current) => (e.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                  />
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="truncate text-[15px] font-extrabold">{row.name || row.email}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">{row.name ? row.email : ""}{row.phone ? `${row.name ? " · " : ""}${row.phone}` : ""}</div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1 sm:w-[180px]">
                    {row.tags.slice(0, 3).map((tagName) => <Pill key={tagName} tone="muted">{tagName}</Pill>)}
                    {row.tags.length > 3 ? <Pill tone="muted">+{row.tags.length - 3}</Pill> : null}
                  </div>
                  <div className="text-[13px] text-app-ink-soft sm:w-[190px]" title={row.consent?.at ? t("subs.agreed", { date: formatDate(row.consent.at, true, locale) }) : undefined}>
                    {row.sourceLabel} · {formatDate(row.createdAt, false, locale)}
                    <div>{row.consent ? `${row.consent.email ? t("channel.email") : t("subs.noEmail")}${row.consent.text ? " + SMS/WhatsApp" : ""}` : t("subs.noConsent")}</div>
                  </div>
                  <Pill tone={status.tone}>{t(status.label)}</Pill>
                </li>
              );
            })}
          </ul>
          <Pagination {...pagination} label={t("subs.pages")} className="border-t border-app-line px-4 py-3 sm:px-5" />
        </Card>
      ) : (
        <EmptyState icon="users" title={t("subs.emptyTitle")} action={<PillButton size="md" onClick={() => setModal("import")}>{t("subs.emptyAction")}</PillButton>}>
          {t("subs.emptyBody")}
        </EmptyState>
      )}

      {modal === "add" ? <AddPerson onClose={() => setModal(null)} onDone={() => { setModal(null); setNotice(t("subs.added")); router.refresh(); }} /> : null}
      {modal === "import" ? <ImportCsv onClose={() => setModal(null)} onDone={(message) => { setModal(null); setNotice(message); router.refresh(); }} /> : null}
    </div>
  );
}
