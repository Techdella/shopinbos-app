"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, checkClass, formatDate, inputClass, selectClass } from "@/components/growth/kit";
import { api, errorText } from "../_kit/client";

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

const STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "success", label: "Subscribed" },
  unsubscribed: { tone: "warning", label: "Unsubscribed" },
  bounced: { tone: "danger", label: "Bounced" },
  spam: { tone: "danger", label: "Spam" },
};

const COLUMN_LABEL: Record<string, string> = { email: "Email", name: "Name", first_name: "First name", last_name: "Last name", phone: "Phone", country: "Location", tags: "Tags", birthday: "Birthday", ignore: "Skip" };

function AddPerson({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
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
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
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
    <Modal title="Add a subscriber" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <Field label="Email" htmlFor="add-email"><input id="add-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (optional)" htmlFor="add-name"><input id="add-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
          <Field label="Phone (optional)" htmlFor="add-phone"><input id="add-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="0803…" /></Field>
          <Field label="Birthday (optional)" htmlFor="add-bday" hint="Day/month, e.g. 07/03"><input id="add-bday" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={inputClass} placeholder="DD/MM" /></Field>
          <Field label="Tags (optional)" htmlFor="add-tags" hint="Separate with commas"><input id="add-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className={inputClass} placeholder="vip, lagos" /></Field>
        </div>
        <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={form.emailOk} onChange={(e) => setForm({ ...form, emailOk: e.target.checked })} /> This person agreed to get marketing emails from my shop</label>
        <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={form.textOk} onChange={(e) => setForm({ ...form, textOk: e.target.checked })} /> They also agreed to SMS and WhatsApp offers</label>
        <Field label="How they agreed (optional)" htmlFor="add-note"><input id="add-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputClass} placeholder="e.g. Signed up at our pop-up stand" maxLength={300} /></Field>
        <label className="flex items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={form.welcome} onChange={(e) => setForm({ ...form, welcome: e.target.checked })} /> Start the welcome automation if it's on</label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={busy} disabled={!form.emailOk}>Add</PillButton>
        </div>
      </form>
    </Modal>
  );
}

function ImportCsv({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
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
    if (file.size > 5_000_000) return setError("That file is too big (5 MB max).");
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
      onDone(`Imported: ${result.added} new, ${result.updated} updated${result.skipped ? `, ${result.skipped} rows without an email skipped` : ""}${result.failed ? `, ${result.failed} failed` : ""}.`);
    } catch (runError) {
      setError(errorText(runError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import from a CSV file" onClose={onClose} wide>
      <div className="grid gap-4">
        <p className="m-0 text-[14px] text-app-ink-soft">A spreadsheet saved as CSV with an email column. Name, phone, location, tags and birthday columns are picked up too. People who unsubscribed before stay unsubscribed.</p>
        <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-dashed border-app-line-strong px-4 text-[14px] font-bold hover:bg-app-canvas">
          <Icon name="upload" size={16} /> {fileName || "Choose a CSV file"}
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
                          aria-label={`Column ${index + 1}`}
                          className={`${selectClass} h-[38px] text-[13px]`}
                          value={column}
                          onChange={(e) => {
                            const next = columns.map((c, i) => (i === index ? e.target.value : c));
                            setColumns(next);
                            void check(csv, next);
                          }}
                        >
                          {Object.entries(COLUMN_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
            <p className="m-0 text-[14px] font-bold">{preview.total.toLocaleString("en-NG")} people found{preview.skipped ? ` · ${preview.skipped} rows without a valid email will be skipped` : ""}</p>
            <Field label="Tag everyone in this file (optional)" htmlFor="imp-tag"><input id="imp-tag" value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass} placeholder="e.g. trade-fair-2026" /></Field>
            <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> Everyone in this file agreed to get marketing emails from my shop</label>
            <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className={`${checkClass} mt-0.5`} checked={textOk} onChange={(e) => setTextOk(e.target.checked)} /> They also agreed to SMS and WhatsApp offers</label>
          </>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" busy={busy} disabled={!preview || !agreed} onClick={() => void run()}>Import {preview ? preview.total.toLocaleString("en-NG") : ""}</PillButton>
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
  pagination: { page: number; pages: number; prev: string | null; next: string | null };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<"add" | "import" | null>(null);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const allOnPage = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  async function bulk(action: "tag" | "untag" | "unsubscribe" | "delete") {
    if (action === "unsubscribe" && !window.confirm(`Unsubscribe ${selected.length} ${selected.length === 1 ? "person" : "people"}? They won't get marketing emails until they sign up again themselves.`)) return;
    if (action === "delete" && !window.confirm(`Remove ${selected.length} from your list? Unsubscribed people are kept as "do not contact".`)) return;
    if ((action === "tag" || action === "untag") && !tag.trim()) return setError("Type a tag first.");
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ updated: number; kept?: number }>("/api/app/marketing/subscribers/bulk", "POST", { ids: selected, action, tag: tag.trim() || undefined });
      setNotice(`${action === "tag" ? "Tagged" : action === "untag" ? "Untagged" : action === "unsubscribe" ? "Unsubscribed" : "Removed"} ${result.updated}.${result.kept ? ` ${result.kept} unsubscribed people were kept as do-not-contact.` : ""}`);
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
        <PillButton size="md" tone="accent" onClick={() => setModal("add")}><Icon name="plus" size={16} /> Add a subscriber</PillButton>
        <PillButton size="md" tone="white" onClick={() => setModal("import")}><Icon name="upload" size={16} /> Import CSV</PillButton>
        <a href={exportHref} className={buttonClass("white")} download><Icon name="download" size={16} /> Export CSV</a>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      {selected.length ? (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <strong className="px-2 text-[14px]">{selected.length} selected</strong>
          <input aria-label="Tag" list="sub-tags" value={tag} onChange={(e) => setTag(e.target.value)} className={`${inputClass} h-[40px] w-[160px]`} placeholder="Tag" />
          <datalist id="sub-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => void bulk("tag")}>Add tag</button>
          <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => void bulk("untag")}>Remove tag</button>
          <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => void bulk("unsubscribe")}>Unsubscribe</button>
          <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => void bulk("delete")}>Remove</button>
          <button type="button" className={buttonClass("ghost", "sm", "ml-auto")} onClick={() => setSelected([])}>Clear</button>
        </Card>
      ) : null}

      {rows.length ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-app-line px-4 py-3 text-[13px] text-app-ink-soft sm:px-5">
            <input type="checkbox" aria-label="Select everyone on this page" className={checkClass} checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? rows.map((row) => row.id) : [])} />
            <span>{total.toLocaleString("en-NG")} {total === 1 ? "person" : "people"}</span>
          </div>
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {rows.map((row) => {
              const status = STATUS[row.status] ?? STATUS.active;
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.email}`}
                    className={checkClass}
                    checked={selected.includes(row.id)}
                    onChange={(e) => setSelected((current) => (e.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                  />
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="truncate text-[15px] font-extrabold">{row.name || row.email}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">{row.name ? row.email : ""}{row.phone ? `${row.name ? " · " : ""}${row.phone}` : ""}</div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1 sm:w-[180px]">
                    {row.tags.slice(0, 3).map((t) => <Pill key={t} tone="muted">{t}</Pill>)}
                    {row.tags.length > 3 ? <Pill tone="muted">+{row.tags.length - 3}</Pill> : null}
                  </div>
                  <div className="text-[13px] text-app-ink-soft sm:w-[190px]" title={row.consent?.at ? `Agreed ${formatDate(row.consent.at, true)}` : undefined}>
                    {row.sourceLabel} · {formatDate(row.createdAt)}
                    <div>{row.consent ? `${row.consent.email ? "Email" : "No email"}${row.consent.text ? " + SMS/WhatsApp" : ""}` : "Consent not recorded"}</div>
                  </div>
                  <Pill tone={status.tone}>{status.label}</Pill>
                </li>
              );
            })}
          </ul>
          {pagination.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between gap-2 border-t border-app-line px-4 py-3 text-[14px] sm:px-5">
              {pagination.prev ? <a href={pagination.prev} className={buttonClass("white", "sm")}>Previous</a> : <span />}
              <span className="text-app-ink-soft">Page {pagination.page} of {pagination.pages}</span>
              {pagination.next ? <a href={pagination.next} className={buttonClass("white", "sm")}>Next</a> : <span />}
            </nav>
          ) : null}
        </Card>
      ) : (
        <EmptyState icon="users" title="Nobody here yet" action={<PillButton size="md" onClick={() => setModal("import")}>Import a CSV</PillButton>}>
          Turn on a sign-up pop-up, import a list you already have, or add people one by one. Past customers can already get your messages through groups of customers.
        </EmptyState>
      )}

      {modal === "add" ? <AddPerson onClose={() => setModal(null)} onDone={() => { setModal(null); setNotice("Added."); router.refresh(); }} /> : null}
      {modal === "import" ? <ImportCsv onClose={() => setModal(null)} onDone={(message) => { setModal(null); setNotice(message); router.refresh(); }} /> : null}
    </div>
  );
}
