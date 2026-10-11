"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Pill, type Tone } from "@/components/app-kit";
import { Notice, PillButton, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, checkClass, formatDate, inputClass, selectClass, textareaClass } from "@/components/growth/kit";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  source: string;
  status: string;
  tags: string[];
  lastOpenedAt: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "bounced", label: "Bounced" },
  { value: "spam", label: "Marked as spam" },
];

const STATUS_PILL: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "success", label: "Active" },
  unsubscribed: { tone: "warning", label: "Unsubscribed" },
  bounced: { tone: "danger", label: "Bounced" },
  spam: { tone: "danger", label: "Spam" },
};

const SOURCES: Record<string, string> = {
  newsletter_form: "Newsletter form",
  checkout_optin: "Checkout",
  customer_account: "Customer account",
  lead_magnet: "Lead magnet",
  popup: "Popup",
  landing_page: "Landing page",
  manual_import: "Added by hand",
  csv_upload: "CSV upload",
  api: "API",
  order: "Order",
};

const PAGE_SIZE = 20;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json?.data;
}

/** "email" or "email,name" per line; header rows and junk are skipped. */
function parseImport(text: string) {
  const seen = new Set<string>();
  const rows: Array<{ email: string; name?: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const [rawEmail, ...rest] = line.split(/[,;\t]/).map((part) => part.trim().replace(/^"|"$/g, ""));
    const email = rawEmail?.toLowerCase();
    if (!email || !EMAIL.test(email) || seen.has(email)) continue;
    seen.add(email);
    const name = rest.join(" ").trim();
    rows.push(name ? { email, name: name.slice(0, 120) } : { email });
  }
  return rows;
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("csv_upload");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = parseImport(text);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rows.length) return;
    setSaving(true);
    setError(null);
    try {
      let created = 0;
      let failed = 0;
      for (let start = 0; start < rows.length; start += 500) {
        const result = (await send("/api/store/subscribers/import", "POST", {
          subscribers: rows.slice(start, start + 500).map((row) => ({ ...row, source })),
        })) as { created?: number; errors?: number } | undefined;
        created += result?.created ?? 0;
        failed += result?.errors ?? 0;
      }
      onDone(`Imported ${created} subscriber${created === 1 ? "" : "s"}.${failed ? ` ${failed} couldn't be added.` : ""}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Import subscribers" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass("white", "sm")}>
            <Icon name="upload" size={14} /> Choose a CSV file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setText(await file.text());
            }}
          />
        </div>
        <Field label="Or paste emails, one per line" htmlFor="imp-text" hint="You can add a name after a comma: ada@example.com, Ada Obi">
          <textarea id="imp-text" value={text} onChange={(e) => setText(e.target.value)} className={`${textareaClass} font-mono text-[13px]`} rows={7} placeholder={"ada@example.com, Ada Obi\nkemi@example.com"} />
        </Field>
        <Field label="Where they came from" htmlFor="imp-source">
          <select id="imp-source" value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>
            <option value="csv_upload">CSV upload</option>
            <option value="manual_import">Added by hand</option>
            <option value="newsletter_form">Newsletter form</option>
            <option value="api">API</option>
          </select>
        </Field>
        <p className="m-0 text-[13.5px] text-app-ink-soft">{rows.length ? `${rows.length} email${rows.length === 1 ? "" : "s"} ready to import.` : "No valid emails yet."}</p>
        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving} disabled={!rows.length}>Import</PillButton>
        </div>
      </form>
    </Modal>
  );
}

function EditDialog({ subscriber, onClose, onDone }: { subscriber: Subscriber; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(subscriber.name ?? "");
  const [tags, setTags] = useState(subscriber.tags?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await send(`/api/store/subscribers/${subscriber.id}`, "PATCH", { name, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
      onDone();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={subscriber.email} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <Field label="Name" htmlFor="sub-name"><input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={120} /></Field>
        <Field label="Tags, separated by commas" htmlFor="sub-tags"><input id="sub-tags" value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} placeholder="vip, repeat, lagos" /></Field>
        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving}>Save</PillButton>
        </div>
      </form>
    </Modal>
  );
}

export function SubscribersManager() {
  const router = useRouter();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: "import" } | { kind: "edit"; subscriber: Subscriber } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      if (source) params.set("source", source);
      const res = await fetch(`/api/store/subscribers?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message);
      setSubscribers(Array.isArray(json.data) ? json.data : []);
      setTotal(json.pagination?.total ?? 0);
      setSelected(new Set());
    } catch {
      setMessage({ tone: "error", text: "Couldn't load subscribers. Try again." });
    } finally {
      setLoading(false);
    }
  }, [page, search, status, source]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    setMessage(null);
    try {
      await run();
      setMessage({ tone: "success", text: done });
      await load();
      router.refresh();
    } catch (actError) {
      setMessage({ tone: "error", text: actError instanceof Error ? actError.message : "Something went wrong. Try again." });
    }
  }

  const ids = Array.from(selected);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOn = subscribers.length > 0 && subscribers.every((subscriber) => selected.has(subscriber.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 sm:w-[300px]">
          <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by email or name"
            aria-label="Search by email or name"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint"
          />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${selectClass} h-[44px] w-auto rounded-full`}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className={`${selectClass} h-[44px] w-auto rounded-full`}>
          <option value="">Any source</option>
          {Object.entries(SOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <PillButton size="md" tone="accent" className="sm:ml-auto" onClick={() => setDialog({ kind: "import" })}><Icon name="upload" size={16} /> Import</PillButton>
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-app-ink px-4 py-2.5 text-white">
          <span className="mr-auto text-[14px] font-bold">{ids.length} selected</span>
          <button type="button" className={buttonClass("white", "sm")} onClick={() => void act(() => send("/api/store/subscribers/bulk", "PATCH", { ids, action: "unsubscribe" }), `${ids.length} unsubscribed.`)}>Unsubscribe</button>
          <button
            type="button"
            className={buttonClass("danger", "sm")}
            onClick={() => {
              if (window.confirm(`Delete ${ids.length} subscriber${ids.length === 1 ? "" : "s"}?`)) void act(() => send("/api/store/subscribers/bulk", "DELETE", { ids }), `${ids.length} deleted.`);
            }}
          >
            Delete
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-app-line px-4 py-2.5 sm:px-5">
          <input
            type="checkbox"
            aria-label="Select all on this page"
            checked={allOn}
            onChange={(e) => setSelected(e.target.checked ? new Set(subscribers.map((subscriber) => subscriber.id)) : new Set())}
            className={checkClass}
          />
          <span className="text-[13px] font-bold text-app-ink-soft">{total.toLocaleString("en-NG")} subscriber{total === 1 ? "" : "s"}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-5 py-10 text-[14px] text-app-ink-soft" role="status"><Spinner /> Loading</div>
        ) : subscribers.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[16px] font-extrabold">{search || status || source ? "No one matches" : "No subscribers yet"}</div>
            <p className="mx-auto mb-0 mt-1 max-w-[420px] text-[14px] text-app-ink-soft">Import a list, or add a newsletter form or popup to your store so shoppers can join.</p>
          </div>
        ) : (
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {subscribers.map((subscriber) => {
              const pill = STATUS_PILL[subscriber.status] ?? { tone: "muted" as Tone, label: subscriber.status };
              return (
                <li key={subscriber.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${subscriber.email}`}
                    checked={selected.has(subscriber.id)}
                    onChange={() => setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(subscriber.id)) next.delete(subscriber.id);
                      else next.add(subscriber.id);
                      return next;
                    })}
                    className={checkClass}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-extrabold">{subscriber.email}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {[subscriber.name, SOURCES[subscriber.source] ?? subscriber.source, subscriber.tags?.length ? subscriber.tags.join(", ") : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-[12.5px] text-app-ink-soft sm:w-[150px]">
                    Joined {formatDate(subscriber.createdAt)}
                    <div>{subscriber.lastOpenedAt ? `Opened ${formatDate(subscriber.lastOpenedAt)}` : "No opens yet"}</div>
                  </div>
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDialog({ kind: "edit", subscriber })} className={buttonClass("white", "sm")}>Edit</button>
                    {subscriber.status === "active" && (
                      <button type="button" onClick={() => void act(() => send(`/api/store/subscribers/${subscriber.id}`, "PATCH", { status: "unsubscribed" }), `${subscriber.email} unsubscribed.`)} className={buttonClass("white", "sm")}>Unsubscribe</button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${subscriber.email}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${subscriber.email}?`)) void act(() => send(`/api/store/subscribers/${subscriber.id}`, "DELETE"), `${subscriber.email} deleted.`);
                      }}
                      className={buttonClass("danger", "sm")}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {totalPages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          <PillButton size="sm" tone="white" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</PillButton>
          <span className="text-[13px] text-app-ink-soft">Page {page} of {totalPages}</span>
          <PillButton size="sm" tone="white" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</PillButton>
        </nav>
      )}

      {dialog?.kind === "import" && (
        <ImportDialog
          onClose={() => setDialog(null)}
          onDone={(text) => {
            setDialog(null);
            setMessage({ tone: "success", text });
            void load();
            router.refresh();
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <EditDialog
          subscriber={dialog.subscriber}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            setMessage({ tone: "success", text: "Subscriber saved." });
            void load();
          }}
        />
      )}
    </div>
  );
}
