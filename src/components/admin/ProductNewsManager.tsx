"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { EmailPreviewIframe } from "@/app/home/marketing/_kit/EmailFrame";
import { Card, CardHead, Pill, type Tone } from "@/components/app-kit";
import { DeviceToggle, FieldLabel, Notice, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
import { textareaClass } from "@/components/growth/kit";
import { PRODUCT_NEWS_AUDIENCES, audienceLabel, isAllowedNewsImage, productNewsDocument, type NewsAudience, type NewsImageHosts } from "@/lib/email/product-news";
import type { PlatformLegal } from "@/lib/email/shell";
import { NewsImageUpload } from "./NewsImageUpload";

// /admin/product-news: write the email (live preview in the real shell), pick who gets it (with a count that
// already leaves out people who turned product news off), send yourself a test, then send now or schedule it.
// Sends run in batches on the server; this page polls the progress while one is going out.

export interface BroadcastRow {
  id: string;
  subject: string;
  preheader: string | null;
  heading: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  audience: string[];
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  /** Failed rows "Retry failed" would resend (the provider refused them, so nothing went out). */
  retryableCount: number;
  /** Failed rows that may have been delivered: never resent, to avoid duplicates. */
  unconfirmedCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Draft {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  audience: NewsAudience[];
}

interface Counts {
  total: number;
  optedOut: number;
  eligible: number;
  byRole: Array<{ role: string; total: number; optedOut: number; eligible: number }>;
}

const EMPTY: Draft = {
  subject: "",
  preheader: "",
  heading: "",
  body: "",
  imageUrl: "",
  ctaLabel: "",
  ctaUrl: "",
  audience: ["seller", "supplier", "logistics_partner"],
};

const STARTER_BODY = "Hi there,\n\nWrite a few short paragraphs about what's new.\n\n## What you can do now\n\n- One thing that's easier\n- Another thing you'll like\n\nQuestions? Just reply to this email.";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "muted" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "warning" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

function toDraft(row: BroadcastRow): Draft {
  return {
    subject: row.subject,
    preheader: row.preheader ?? "",
    heading: row.heading,
    body: row.body,
    imageUrl: row.imageUrl ?? "",
    ctaLabel: row.ctaLabel ?? "",
    ctaUrl: row.ctaUrl ?? "",
    audience: row.audience.filter((a): a is NewsAudience => PRODUCT_NEWS_AUDIENCES.some((x) => x.key === a)),
  };
}

function payload(draft: Draft) {
  return {
    subject: draft.subject,
    preheader: draft.preheader || null,
    heading: draft.heading,
    body: draft.body,
    imageUrl: draft.imageUrl || null,
    ctaLabel: draft.ctaLabel || null,
    ctaUrl: draft.ctaUrl || null,
    audience: draft.audience,
  };
}

const n = (value: number) => value.toLocaleString("en-NG");

function when(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? "Something went wrong. Try again.");
  return json.data as T;
}

export function ProductNewsManager({ initial, appUrl, legal, hosts, adminEmail }: { initial: BroadcastRow[]; appUrl: string; legal: PlatformLegal; hosts: NewsImageHosts; adminEmail: string | null }) {
  const [rows, setRows] = useState<BroadcastRow[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, body: STARTER_BODY });
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [later, setLater] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const deferred = useDeferredValue(draft);
  const previewHtml = useMemo(() => productNewsDocument(deferred, { appUrl, legal, hosts, reason: "you have a Shopinbos seller account" }), [deferred, appUrl, legal, hosts]);
  const imageProblem = draft.imageUrl.trim() && !isAllowedNewsImage(draft.imageUrl, hosts) ? "Use an https image from Shopinbos storage or shopinbos.com. Other links won't show." : null;
  const editing = rows.find((r) => r.id === editingId) ?? null;
  const locked = Boolean(editing && !["draft", "scheduled"].includes(editing.status));

  // Recipient count, refreshed when the audience changes.
  const audienceKey = draft.audience.join(",");
  useEffect(() => {
    if (!audienceKey) {
      setCounts({ total: 0, optedOut: 0, eligible: 0, byRole: [] });
      return;
    }
    let live = true;
    call<Counts>(`/api/admin/product-news/audience?roles=${audienceKey}`)
      .then((data) => live && setCounts(data))
      .catch(() => live && setCounts(null));
    return () => {
      live = false;
    };
  }, [audienceKey]);

  const reload = useCallback(async () => {
    try {
      setRows(await call<BroadcastRow[]>("/api/admin/product-news?limit=20"));
    } catch {
      // keep what we have
    }
  }, []);

  // Poll while something is going out.
  const sending = rows.some((r) => r.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => void reload(), 4000);
    return () => window.clearInterval(timer);
  }, [sending, reload]);

  function startNew() {
    setEditingId(null);
    setDraft({ ...EMPTY, body: STARTER_BODY });
    setLater(false);
    setScheduleAt("");
    setError(null);
    setNotice(null);
  }

  function open(row: BroadcastRow) {
    setEditingId(row.id);
    setDraft(toDraft(row));
    setLater(row.status === "scheduled");
    setScheduleAt(row.scheduledAt ? new Date(new Date(row.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(): Promise<string> {
    const body = JSON.stringify(payload(draft));
    const saved = editingId
      ? await call<BroadcastRow>(`/api/admin/product-news/${editingId}`, { method: "PATCH", body })
      : await call<BroadcastRow>("/api/admin/product-news", { method: "POST", body });
    setEditingId(saved.id);
    await reload();
    return saved.id;
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const onSave = () => run("save", async () => {
    await save();
    setNotice("Draft saved.");
  });

  const onTest = () => run("test", async () => {
    const result = await call<{ to: string }>("/api/admin/product-news/test", { method: "POST", body: JSON.stringify(payload(draft)) });
    setNotice(`Test sent to ${result.to}. Check your inbox.`);
  });

  const onSend = () => run("send", async () => {
    const at = later && scheduleAt ? new Date(scheduleAt) : null;
    if (later && (!at || Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 2 * 60_000)) throw new Error("Pick a time at least a few minutes from now.");
    const count = counts?.eligible ?? 0;
    const question = at
      ? `Schedule "${draft.subject}" for ${when(at.toISOString())} (Lagos time) to about ${n(count)} people?`
      : `Send "${draft.subject}" to ${n(count)} ${count === 1 ? "person" : "people"} now? This can't be undone.`;
    if (!(await confirmDialog(question))) return;
    const id = await save();
    const result = await call<{ broadcast: BroadcastRow; progress: { status: string; sent?: number; skipped?: number; failed?: number; queued?: number } }>(`/api/admin/product-news/${id}/send`, {
      method: "POST",
      body: JSON.stringify(at ? { scheduledAt: at.toISOString() } : {}),
    });
    await reload();
    if (result.progress.status === "scheduled") setNotice(`Scheduled for ${when(at!.toISOString())} (Lagos time).`);
    else setNotice(result.progress.status === "sent" ? `Sent to ${n(result.progress.sent ?? 0)} people.` : `Sending: ${n(result.progress.sent ?? 0)} sent so far. The rest go out in the background.`);
    startNewKeepNotice();
  });

  function startNewKeepNotice() {
    setEditingId(null);
    setDraft({ ...EMPTY, body: STARTER_BODY });
    setLater(false);
    setScheduleAt("");
  }

  const rowAction = (row: BroadcastRow, action: "retry" | "unschedule" | "delete") =>
    run(`${action}-${row.id}`, async () => {
      if (action === "retry") await call(`/api/admin/product-news/${row.id}/retry`, { method: "POST", body: "{}" });
      if (action === "unschedule") await call(`/api/admin/product-news/${row.id}`, { method: "PATCH", body: JSON.stringify({ unschedule: true }) });
      if (action === "delete") {
        if (!(await confirmDialog(`Delete the draft "${row.subject}"?`))) return;
        await call(`/api/admin/product-news/${row.id}`, { method: "DELETE" });
        if (editingId === row.id) startNew();
      }
      await reload();
    });

  const toggleAudience = (key: NewsAudience) => set({ audience: draft.audience.includes(key) ? draft.audience.filter((a) => a !== key) : [...draft.audience, key] });
  const everyone = PRODUCT_NEWS_AUDIENCES.every((a) => draft.audience.includes(a.key));
  const roleCount = (key: string) => counts?.byRole.find((r) => r.role === key);
  const canSend = Boolean(draft.subject.trim() && draft.heading.trim() && draft.body.trim() && draft.audience.length && !imageProblem && !locked);

  return (
    <div className="grid gap-5">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
          <CardHead
            title={editing ? `Editing: ${editing.subject}` : "New product news email"}
            sub="Use a blank line between paragraphs. **bold**, *italic*, [link text](https://…), “## ” for a subheading and “- ” for bullet points."
            action={editing ? <PillButton tone="white" size="sm" onClick={startNew}>New email</PillButton> : null}
          />

          <div className="grid gap-1.5">
            <FieldLabel htmlFor="pn-subject">Subject</FieldLabel>
            <TextInput id="pn-subject" value={draft.subject} maxLength={160} disabled={locked} onChange={(e) => set({ subject: e.target.value })} placeholder="New: get paid by bank transfer" />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="pn-preheader">Preview line (shown after the subject in the inbox)</FieldLabel>
            <TextInput id="pn-preheader" value={draft.preheader} maxLength={200} disabled={locked} onChange={(e) => set({ preheader: e.target.value })} placeholder="Two minutes to set up, no extra fees" />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="pn-heading">Heading</FieldLabel>
            <TextInput id="pn-heading" value={draft.heading} maxLength={160} disabled={locked} onChange={(e) => set({ heading: e.target.value })} placeholder="Bank transfers are here" />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="pn-body">Message</FieldLabel>
            <textarea id="pn-body" rows={10} value={draft.body} maxLength={20000} disabled={locked} onChange={(e) => set({ body: e.target.value })} className={cx(textareaClass, "font-mono text-[13.5px]")} />
          </div>
          <NewsImageUpload value={draft.imageUrl} onChange={(imageUrl) => set({ imageUrl })} hosts={hosts} disabled={locked} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="pn-cta-label">Button label (optional)</FieldLabel>
              <TextInput id="pn-cta-label" value={draft.ctaLabel} maxLength={60} disabled={locked} onChange={(e) => set({ ctaLabel: e.target.value })} placeholder="Try it now" />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="pn-cta-url">Button link</FieldLabel>
              <TextInput id="pn-cta-url" value={draft.ctaUrl} disabled={locked} onChange={(e) => set({ ctaUrl: e.target.value })} placeholder={`${appUrl}/home`} inputMode="url" />
            </div>
          </div>

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-[13px] font-bold text-app-ink">Who gets it</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={locked}
                aria-pressed={everyone}
                onClick={() => set({ audience: everyone ? [] : PRODUCT_NEWS_AUDIENCES.map((a) => a.key) })}
                className={cx("min-h-[40px] rounded-full border px-4 text-[13.5px] font-bold transition", everyone ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}
              >
                Everyone
              </button>
              {PRODUCT_NEWS_AUDIENCES.map((a) => {
                const on = draft.audience.includes(a.key);
                const c = roleCount(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    disabled={locked}
                    aria-pressed={on}
                    onClick={() => toggleAudience(a.key)}
                    className={cx("min-h-[40px] rounded-full border px-4 text-[13.5px] font-bold transition", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}
                  >
                    {a.label}
                    {c ? <span className={cx("ml-1.5 font-mono text-[12px]", on ? "text-white/75" : "text-app-ink-soft")}>{n(c.eligible)}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="m-0 text-[13.5px] text-app-ink-soft" aria-live="polite">
              {counts ? (
                <>
                  <strong className="text-app-ink">{n(counts.eligible)}</strong> {counts.eligible === 1 ? "person" : "people"} will get it
                  {counts.optedOut ? <> · {n(counts.optedOut)} turned off product news and won&apos;t</> : null}
                </>
              ) : (
                "Counting…"
              )}
            </p>
          </fieldset>

          <div className="grid gap-2 rounded-[14px] border border-app-line p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold">Send later</span>
              <Toggle on={later} onChange={setLater} label="Send later" />
            </div>
            {later ? (
              <div className="grid gap-1.5">
                <FieldLabel htmlFor="pn-when">Date and time (your time zone)</FieldLabel>
                <TextInput id="pn-when" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              </div>
            ) : null}
          </div>

          {locked ? <Notice tone="info">This email has already gone out, so it can&apos;t be edited. Start a new one instead.</Notice> : null}

          <div className="flex flex-wrap gap-2">
            <PillButton tone="ink" size="md" disabled={!canSend || Boolean(busy)} busy={busy === "send"} onClick={onSend}>
              {later ? "Schedule" : "Send now"}
            </PillButton>
            <PillButton tone="white" size="md" disabled={!canSend || Boolean(busy)} busy={busy === "test"} onClick={onTest} title={adminEmail ? `Sends to ${adminEmail}` : undefined}>
              Send me a test
            </PillButton>
            <PillButton tone="white" size="md" disabled={!draft.subject.trim() || locked || Boolean(busy)} busy={busy === "save"} onClick={onSave}>
              Save draft
            </PillButton>
          </div>
        </Card>

        <Card className="grid min-w-0 content-start gap-3 p-4 sm:p-5">
          <CardHead title="Preview" sub="Exactly what people get: the Shopinbos logo, light and dark mode, and the footer with Unsubscribe." action={<DeviceToggle value={device} onChange={setDevice} size="sm" />} />
          <div className="overflow-hidden rounded-[18px] border border-app-line bg-app-canvas">
            <EmailPreviewIframe title="Email preview" html={previewHtml} className={cx("mx-auto block h-[720px] border-0 bg-white", device === "mobile" ? "w-[375px] max-w-full" : "w-full")} />
          </div>
          <p className="m-0 truncate text-[12.5px] text-app-ink-soft">
            <span className="font-semibold text-app-ink">{draft.subject || "Subject"}</span> · {draft.preheader || "Preview line"}
          </p>
        </Card>
      </div>

      <Card className="grid gap-0 p-0">
        <div className="border-b border-app-line px-4 py-3 sm:px-5">
          <h2 className="m-0 text-[16px] font-extrabold">Sent and drafts</h2>
        </div>
        {rows.length ? (
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {rows.map((row) => {
              const status = STATUS[row.status] ?? { label: row.status, tone: "muted" as Tone };
              const done = row.sentCount + row.failedCount + row.skippedCount;
              const pct = row.recipientCount ? Math.round((done / row.recipientCount) * 100) : 0;
              return (
                <li key={row.id} className="grid gap-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="grid min-w-0 gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-[14.5px] font-bold">{row.subject}</span>
                      <Pill tone={status.tone} dot>{status.label}</Pill>
                    </div>
                    <p className="m-0 text-[12.5px] text-app-ink-soft">
                      {audienceLabel(row.audience)}
                      {row.status === "scheduled" && row.scheduledAt ? ` · goes out ${when(row.scheduledAt)}` : ""}
                      {row.sentAt ? ` · finished ${when(row.sentAt)}` : row.status === "draft" ? ` · saved ${when(row.updatedAt)}` : ""}
                    </p>
                    {row.recipientCount ? (
                      <div className="grid gap-1">
                        <div className="h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                          <div className="h-full rounded-full bg-app-success" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="m-0 font-mono text-[12px] text-app-ink-soft">
                          {n(row.sentCount)} sent · {n(row.failedCount)} failed · {n(row.skippedCount)} skipped (preferences) · {n(row.recipientCount)} total
                        </p>
                      </div>
                    ) : null}
                    {row.lastError ? <p className="m-0 text-[12.5px] font-semibold text-app-danger">{row.lastError}</p> : null}
                    {row.unconfirmedCount > 0 && row.status !== "draft" ? (
                      <p className="m-0 text-[12.5px] text-app-ink-soft">
                        {n(row.unconfirmedCount)} couldn&apos;t be confirmed and won&apos;t be resent to avoid duplicates.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["draft", "scheduled"].includes(row.status) ? <PillButton tone="white" size="sm" onClick={() => open(row)}>Edit</PillButton> : <PillButton tone="white" size="sm" onClick={() => open(row)}>View</PillButton>}
                    {row.status === "scheduled" ? <PillButton tone="white" size="sm" busy={busy === `unschedule-${row.id}`} onClick={() => rowAction(row, "unschedule")}>Unschedule</PillButton> : null}
                    {row.retryableCount > 0 && row.status !== "draft" ? <PillButton tone="white" size="sm" busy={busy === `retry-${row.id}`} onClick={() => rowAction(row, "retry")}>Retry {n(row.retryableCount)} failed</PillButton> : null}
                    {row.status === "draft" ? <PillButton tone="white" size="sm" busy={busy === `delete-${row.id}`} onClick={() => rowAction(row, "delete")}>Delete</PillButton> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 px-4 py-6 text-[14px] text-app-ink-soft sm:px-5">Nothing yet. Your first product news email will show up here with its progress.</p>
        )}
      </Card>
    </div>
  );
}
