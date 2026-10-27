"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog } from "@/components/ui/dialogs";
import { Card, CardHead, Pill, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
import { checkClass, textareaClass } from "@/components/growth/kit";
import { friendlyError } from "@/lib/errors/report-client";
import {
  CUSTOM_LINK,
  PUSH_BODY_MAX,
  PUSH_LINKS,
  PUSH_PLATFORMS,
  PUSH_ROLES,
  PUSH_SCOPES,
  PUSH_TITLE_MAX,
  STATUS_LABEL,
  contentHash,
  dateToLagosInput,
  describeAudience,
  lagosInputToDate,
  parseAudience,
  resolvePushLink,
  scheduleProblem,
  type CampaignStatus,
  type PushAudience,
  type PushPlatform,
  type PushRole,
  type PushScope,
} from "@shared/push-campaigns";

// /admin/push: the overview (devices and delivery health), the composer with a live audience count, previews on
// Android and in a browser, "Send test to me" (required before the first real send of a message), send now or
// schedule (Lagos time) with a confirm step, and the history with counts, Cancel and "Resend to the failed ones".

export interface CampaignView {
  id: string;
  title: string;
  body: string;
  linkKey: string;
  link: string;
  appLink: string | null;
  audience: unknown;
  urgent: boolean;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  testedHash: string | null;
  testedAt: string | null;
  overrideLimit: boolean;
  targetedCount: number;
  deviceCount: number;
  notifiedCount: number;
  failedCount: number;
  pushSent: number;
  pushOk: number;
  pushErrors: number;
  openedCount: number;
  resentAt: string | null;
  lastError: string | null;
  createdById: string;
  sentById: string | null;
  createdByName: string | null;
  sentByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Overview {
  devices: Array<{ platform: string; role: string; total: number; active: number; seen7: number; seen30: number }>;
  health: { ok: number; error: number; expired: number; waiting: number; held: number };
  topErrors: Array<{ error: string; count: number }>;
  receipts: { cronLastRun: string | null; cronStatus: string | null; lastChecked: string | null };
}

interface Estimate {
  people: number;
  pushPeople: number;
  devices: number;
  newsOff: number;
  riders: number;
  riderDevices: number;
  person: { name: string; role: string } | null;
}

interface Draft {
  title: string;
  body: string;
  linkKey: string;
  customPath: string;
  scope: PushScope;
  roles: PushRole[];
  platform: PushPlatform;
  cities: string[];
  includeBellOnly: boolean;
  contact: string;
  urgent: boolean;
}

const EMPTY: Draft = { title: "", body: "", linkKey: "home", customPath: "", scope: "me", roles: ["seller"], platform: "any", cities: [], includeBellOnly: false, contact: "", urgent: false };

const STATUS_TONE: Record<string, Tone> = { draft: "muted", scheduled: "info", sending: "warning", sent: "success", cancelled: "muted", failed: "danger" };
const ROLE_LABEL: Record<string, string> = { seller: "Sellers", supplier: "Suppliers", logistics_partner: "Delivery partners", rider: "Riders", admin: "Admins", other: "Other" };
const PLATFORM_LABEL: Record<string, string> = { android: "Android", ios: "iPhone", web: "Web" };

const n = (value: number) => value.toLocaleString("en-NG");

function when(iso: string | null) {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(iso));
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? "Something went wrong. Try again.");
  return json.data as T;
}

function audienceOf(draft: Draft): PushAudience {
  const parsed = parseAudience({ scope: draft.scope, roles: draft.roles, platform: draft.platform, cities: draft.cities, includeBellOnly: draft.includeBellOnly, contact: draft.contact });
  return "error" in parsed ? { scope: draft.scope, platform: draft.platform } : parsed.audience;
}

function toDraft(row: CampaignView): Draft {
  const parsed = parseAudience(row.audience);
  const audience = "error" in parsed ? null : parsed.audience;
  return {
    title: row.title,
    body: row.body,
    linkKey: row.linkKey,
    customPath: row.linkKey === CUSTOM_LINK ? row.link : "",
    scope: audience?.scope ?? "me",
    roles: audience?.roles ?? ["seller"],
    platform: audience?.platform ?? "any",
    cities: audience?.cities ?? [],
    includeBellOnly: audience?.includeBellOnly ?? false,
    contact: audience?.contact ?? "",
    urgent: row.urgent,
  };
}

function payload(draft: Draft) {
  return { title: draft.title, body: draft.body, linkKey: draft.linkKey, customPath: draft.linkKey === CUSTOM_LINK ? draft.customPath : null, audience: audienceOf(draft), urgent: draft.urgent };
}

const chip = (on: boolean) => cx("min-h-[38px] rounded-full border px-3.5 text-[13px] font-bold transition disabled:opacity-55", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink");

export function PushCenter({ initial, overview, cities, canUrgent, admin }: { initial: CampaignView[]; overview: Overview; cities: Array<{ city: string; count: number }>; canUrgent: boolean; admin: { name: string; email: string | null } }) {
  const [rows, setRows] = useState(initial);
  const [stats, setStats] = useState(overview);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [later, setLater] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const editing = rows.find((row) => row.id === editingId) ?? null;
  const link = resolvePushLink({ linkKey: draft.linkKey, customPath: draft.customPath });
  const hash = link ? contentHash({ title: draft.title, body: draft.body, link: link.link, appLink: link.appLink }) : null;
  const tested = Boolean(editing?.testedHash && hash && editing.testedHash === hash);
  const audience = useMemo(() => audienceOf(draft), [draft]);
  const audienceKey = JSON.stringify(audience);
  const ready = Boolean(draft.title.trim() && draft.body.trim() && link && draft.title.length <= PUSH_TITLE_MAX && draft.body.length <= PUSH_BODY_MAX);

  // Live estimate, a moment after the audience stops changing.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      call<Estimate>("/api/admin/push/audience", { method: "POST", body: JSON.stringify({ audience: JSON.parse(audienceKey) }) })
        .then((data) => live && setEstimate(data))
        .catch(() => live && setEstimate(null));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [audienceKey]);

  const reload = useCallback(async () => {
    try {
      const data = await call<{ overview: Overview; campaigns: CampaignView[] }>("/api/admin/push");
      setRows(data.campaigns);
      setStats(data.overview);
    } catch {
      // keep what we have
    }
  }, []);

  const sending = rows.some((row) => row.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(timer);
  }, [sending, reload]);

  function startNew() {
    setEditingId(null);
    setDraft(EMPTY);
    setLater(false);
    setScheduleAt("");
    setOverride(false);
  }

  function open(row: CampaignView) {
    setEditingId(row.id);
    setDraft(toDraft(row));
    setLater(Boolean(row.scheduledAt));
    setScheduleAt(row.scheduledAt ? dateToLagosInput(row.scheduledAt) : "");
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? friendlyError(e) : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<CampaignView> {
    const body = JSON.stringify(payload(draft));
    const saved = editing && editing.status === "draft"
      ? await call<CampaignView>(`/api/admin/push/campaigns/${editing.id}`, { method: "PATCH", body })
      : await call<CampaignView>("/api/admin/push/campaigns", { method: "POST", body });
    setEditingId(saved.id);
    setRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
    return saved;
  }

  const onTest = () => run("test", async () => {
    const saved = await save();
    const result = await call<{ devices: number; testedHash: string }>(`/api/admin/push/campaigns/${saved.id}/test`, { method: "POST", body: "{}" });
    setRows((current) => current.map((row) => (row.id === saved.id ? { ...row, testedHash: result.testedHash, testedAt: new Date().toISOString() } : row)));
    setNotice(result.devices ? `Test sent to your ${result.devices === 1 ? "phone or browser" : `${result.devices} phones and browsers`}. Check how it looks, then send it.` : "Test sent to your bell. Turn on notifications on your phone or this browser to see the push itself.");
  });

  const onSave = () => run("save", async () => {
    await save();
    setNotice("Draft saved.");
  });

  const onSend = () => run("send", async () => {
    if (!editing || !tested) throw new Error("Send yourself a test of this exact message first.");
    const at = later ? lagosInputToDate(scheduleAt) : null;
    if (later) {
      const problem = at ? scheduleProblem(at) : "Pick a date and time.";
      if (problem) throw new Error(problem);
    }
    const people = (estimate?.people ?? 0) + (estimate?.riders ?? 0);
    const devices = (estimate?.devices ?? 0) + (estimate?.riderDevices ?? 0);
    const sentence = `This sends to ${n(people)} ${people === 1 ? "person" : "people"} on ${n(devices)} ${devices === 1 ? "device" : "devices"}.`;
    const question = at ? `${sentence} It goes out ${when(at.toISOString())} (Lagos time). Schedule it?` : `${sentence} It goes out now and can't be undone. Send it?`;
    if (!(await confirmDialog(question))) return;
    const saved = await save();
    const result = await call<{ status: string; progress?: { delivered: number; remaining: number } }>(`/api/admin/push/campaigns/${saved.id}/send`, { method: "POST", body: JSON.stringify({ scheduledAt: at ? scheduleAt : null, override }) });
    await reload();
    setNotice(result.status === "scheduled" ? `Scheduled for ${when(at!.toISOString())} (Lagos time).` : result.status === "sent" ? `Sent to ${n(result.progress?.delivered ?? 0)} people.` : `Sending: ${n(result.progress?.delivered ?? 0)} done so far. The rest go out in the background.`);
    startNew();
  });

  const rowAction = (row: CampaignView, action: "cancel" | "resend" | "delete") =>
    run(`${action}-${row.id}`, async () => {
      if (action === "cancel") {
        if (!(await confirmDialog(`Cancel "${row.title}"? It won't go out.`))) return;
        await call(`/api/admin/push/campaigns/${row.id}/cancel`, { method: "POST", body: "{}" });
        setNotice("Cancelled. It won't go out.");
      }
      if (action === "resend") {
        const result = await call<{ devices: number; pushed: number; requeued: number }>(`/api/admin/push/campaigns/${row.id}/resend`, { method: "POST", body: "{}" });
        setNotice(`Sent again to ${n(result.pushed)} of ${n(result.devices)} phones and browsers that failed${result.requeued ? `, and retried ${n(result.requeued)} people` : ""}.`);
      }
      if (action === "delete") {
        if (!(await confirmDialog(`Delete "${row.title}"?`))) return;
        await call(`/api/admin/push/campaigns/${row.id}`, { method: "DELETE" });
        if (editingId === row.id) startNew();
      }
      await reload();
    });

  const locked = Boolean(editing && editing.status !== "draft");
  const linkFor = PUSH_LINKS.find((item) => item.key === draft.linkKey);
  const roleMismatch = linkFor && linkFor.for !== "everyone" && draft.scope === "roles" && draft.roles.some((role) => role !== linkFor.for);

  return (
    <div className="grid gap-5">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <OverviewCards overview={stats} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
          <CardHead
            title={editing ? `${editing.status === "draft" ? "Editing" : "Viewing"}: ${editing.title}` : "New push"}
            sub="Short and clear: what's new and why it helps them. Push is for news people want, not every week."
            action={editing ? <PillButton tone="white" size="sm" onClick={startNew}>New push</PillButton> : null}
          />

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="push-title">Title</FieldLabel>
              <Counter value={draft.title.length} max={PUSH_TITLE_MAX} />
            </div>
            <TextInput id="push-title" value={draft.title} maxLength={PUSH_TITLE_MAX} disabled={locked} onChange={(e) => set({ title: e.target.value })} placeholder="Get paid by bank transfer" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="push-body">Message</FieldLabel>
              <Counter value={draft.body.length} max={PUSH_BODY_MAX} />
            </div>
            <textarea id="push-body" rows={3} value={draft.body} maxLength={PUSH_BODY_MAX} disabled={locked} onChange={(e) => set({ body: e.target.value })} className={textareaClass} placeholder="Customers can now pay you by bank transfer at checkout. No extra fees. Tap to switch it on." />
          </div>

          <div className="grid gap-1.5">
            <FieldLabel htmlFor="push-link">When they tap it, open</FieldLabel>
            <select id="push-link" value={draft.linkKey} disabled={locked} onChange={(e) => set({ linkKey: e.target.value })} className="min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] text-app-ink outline-none focus:border-app-ink">
              {PUSH_LINKS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
              <option value={CUSTOM_LINK}>A web page (type the path)</option>
            </select>
            {draft.linkKey === CUSTOM_LINK ? <TextInput aria-label="Web path" value={draft.customPath} disabled={locked} onChange={(e) => set({ customPath: e.target.value })} placeholder="/home/marketing/campaigns" /> : null}
            <p className="m-0 text-[12.5px] text-app-ink-soft">
              {link ? (
                <>Phone app: <span className="font-mono">{link.appRoute ?? "opens the page on the website"}</span> · Browser: <span className="font-mono">{link.link}</span></>
              ) : (
                "Type a path that starts with / (like /home/orders)."
              )}
            </p>
            {roleMismatch ? <p className="m-0 text-[12.5px] font-semibold text-[#8A5A00]">That screen is for {ROLE_LABEL[linkFor!.for]?.toLowerCase()}. Others will land on their own home instead.</p> : null}
          </div>

          <AudiencePicker draft={draft} set={set} disabled={locked} cities={cities} estimate={estimate} adminEmail={admin.email} />

          <div className="grid gap-3 rounded-[14px] border border-app-line p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold">Send later</span>
              <Toggle on={later} onChange={setLater} label="Send later" />
            </div>
            {later ? (
              <div className="grid gap-1.5">
                <FieldLabel htmlFor="push-when">Date and time (Lagos time)</FieldLabel>
                <TextInput id="push-when" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              </div>
            ) : null}
            {canUrgent ? (
              <label className="flex items-start gap-2.5 text-[13.5px]">
                <input type="checkbox" className={cx(checkClass, "mt-0.5")} checked={draft.urgent} disabled={locked} onChange={(e) => set({ urgent: e.target.checked })} />
                <span><strong>Urgent</strong>: ignore people&apos;s quiet hours (10pm to 7am). Only for things that can&apos;t wait until morning, like an outage.</span>
              </label>
            ) : null}
            <label className="flex items-start gap-2.5 text-[13.5px]">
              <input type="checkbox" className={cx(checkClass, "mt-0.5")} checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span><strong>Override the daily limit</strong>: at most 3 campaigns a day go out, so people don&apos;t switch news off.</span>
            </label>
          </div>

          {locked ? <Notice tone="info">This push has already gone out or is scheduled, so it can&apos;t be changed. Start a new one, or cancel it first.</Notice> : null}
          {!locked && ready && !tested ? <Notice tone="info">Send yourself a test first. Sending unlocks once you&apos;ve tested this exact title, message and link.</Notice> : null}

          <div className="flex flex-wrap gap-2">
            <PillButton tone="white" size="md" disabled={!ready || locked || Boolean(busy)} busy={busy === "test"} onClick={onTest} title={admin.email ? `Sends to ${admin.email}'s phone, browsers and bell` : undefined}>
              Send test to me
            </PillButton>
            <PillButton tone="ink" size="md" disabled={!ready || locked || !tested || Boolean(busy)} busy={busy === "send"} onClick={onSend}>
              {later ? "Schedule" : "Send now"}
            </PillButton>
            <PillButton tone="ghost" size="md" disabled={!draft.title.trim() || !link || locked || Boolean(busy)} busy={busy === "save"} onClick={onSave}>
              Save draft
            </PillButton>
          </div>
        </Card>

        <Card className="grid min-w-0 content-start gap-4 p-4 sm:p-5">
          <CardHead title="Preview" sub="Roughly how it shows. Phones cut long lines, so the start matters most." />
          <AndroidPreview title={draft.title} body={draft.body} />
          <BrowserPreview title={draft.title} body={draft.body} />
        </Card>
      </div>

      <History rows={rows} busy={busy} onOpen={open} onAction={rowAction} />
    </div>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={cx("font-mono text-[12px]", value > max ? "font-bold text-app-danger" : value > max * 0.9 ? "text-[#8A5A00]" : "text-app-ink-soft")} aria-live="polite">{value}/{max}</span>;
}

function AudiencePicker({ draft, set, disabled, cities, estimate, adminEmail }: { draft: Draft; set: (patch: Partial<Draft>) => void; disabled: boolean; cities: Array<{ city: string; count: number }>; estimate: Estimate | null; adminEmail: string | null }) {
  const toggleRole = (role: PushRole) => set({ roles: draft.roles.includes(role) ? draft.roles.filter((r) => r !== role) : [...draft.roles, role] });
  const toggleCity = (city: string) => set({ cities: draft.cities.includes(city) ? draft.cities.filter((c) => c !== city) : [...draft.cities, city] });
  const personal = draft.scope === "me" || draft.scope === "user";
  return (
    <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="mb-2 text-[13px] font-bold text-app-ink">Who gets it</legend>
      <div className="flex flex-wrap gap-2">
        {PUSH_SCOPES.map((scope) => (
          <button key={scope.key} type="button" disabled={disabled} aria-pressed={draft.scope === scope.key} onClick={() => set({ scope: scope.key })} className={chip(draft.scope === scope.key)}>
            {scope.label}
          </button>
        ))}
      </div>
      {draft.scope === "roles" ? (
        <div className="flex flex-wrap gap-2" aria-label="Roles">
          {PUSH_ROLES.map((role) => (
            <button key={role.key} type="button" disabled={disabled} aria-pressed={draft.roles.includes(role.key)} onClick={() => toggleRole(role.key)} className={chip(draft.roles.includes(role.key))}>
              {role.label}
            </button>
          ))}
        </div>
      ) : null}
      {draft.scope === "user" ? <TextInput aria-label="Email or phone" value={draft.contact} disabled={disabled} onChange={(e) => set({ contact: e.target.value })} placeholder="ada@example.com or 0803 123 4567" /> : null}
      {draft.scope === "me" ? <p className="m-0 text-[12.5px] text-app-ink-soft">Only your own phone, browsers and bell{adminEmail ? ` (${adminEmail})` : ""}. Doesn&apos;t count towards the daily limit.</p> : null}

      <div className="flex flex-wrap gap-2" aria-label="Devices">
        {PUSH_PLATFORMS.map((platform) => (
          <button key={platform.key} type="button" disabled={disabled} aria-pressed={draft.platform === platform.key} onClick={() => set({ platform: platform.key })} className={chip(draft.platform === platform.key)}>
            {platform.label}
          </button>
        ))}
      </div>

      {!personal && cities.length ? (
        <details className="rounded-[14px] border border-app-line px-3 py-2" open={draft.cities.length > 0}>
          <summary className="cursor-pointer text-[13.5px] font-semibold">City or state {draft.cities.length ? `(${draft.cities.join(", ")})` : "(anywhere)"}</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cities.map((item) => (
              <button key={item.city} type="button" disabled={disabled} aria-pressed={draft.cities.includes(item.city)} onClick={() => toggleCity(item.city)} className={chip(draft.cities.includes(item.city))}>
                {item.city} <span className="font-mono text-[11px] opacity-70">{n(item.count)}</span>
              </button>
            ))}
          </div>
          <p className="m-0 mt-2 text-[12px] text-app-ink-soft">From the store, supplier or delivery business city, or the account&apos;s city. Riders have no city, so they&apos;re left out when one is picked.</p>
        </details>
      ) : null}

      {!personal && draft.platform === "any" ? (
        <label className="flex items-start gap-2.5 text-[13.5px]">
          <input type="checkbox" className={cx(checkClass, "mt-0.5")} checked={draft.includeBellOnly} disabled={disabled} onChange={(e) => set({ includeBellOnly: e.target.checked })} />
          <span>Also put it under the bell for people who have no push switched on</span>
        </label>
      ) : null}

      <p className="m-0 text-[13.5px] text-app-ink-soft" aria-live="polite">
        {estimate ? (
          <>
            <strong className="text-app-ink">{n(estimate.people + estimate.riders)}</strong> {estimate.people + estimate.riders === 1 ? "person" : "people"} ·{" "}
            <strong className="text-app-ink">{n(estimate.devices + estimate.riderDevices)}</strong> {estimate.devices + estimate.riderDevices === 1 ? "device" : "devices"}
            {estimate.riders ? <> · {n(estimate.riders)} riders</> : null}
            {estimate.newsOff ? <> · {n(estimate.newsOff)} switched Shopinbos news off (bell only)</> : null}
            {draft.scope === "user" ? <> · {estimate.person ? `${estimate.person.name} (${ROLE_LABEL[estimate.person.role] ?? estimate.person.role})` : "nobody has that email or number"}</> : null}
          </>
        ) : (
          "Counting…"
        )}
      </p>
    </fieldset>
  );
}

function AndroidPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Android</span>
      <div className="rounded-[22px] bg-[#1F1F24] p-3">
        <div className="rounded-[18px] bg-[#2D2D33] px-3.5 py-3 text-white">
          <div className="flex items-center gap-2 text-[11.5px] text-white/65">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#FF6A2B] text-[9px] font-bold text-white">S</span>
            <span>Shopinbos</span>
            <span>· Shopinbos news · now</span>
          </div>
          <div className="mt-1.5 line-clamp-1 text-[14px] font-semibold">{title || "Title"}</div>
          <div className="line-clamp-2 text-[13px] leading-[1.35] text-white/80">{body || "Your message shows here."}</div>
        </div>
      </div>
    </div>
  );
}

function BrowserPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Browser</span>
      <div className="rounded-[14px] border border-app-line bg-app-canvas p-3">
        <div className="flex gap-3 rounded-[10px] border border-app-line bg-white p-3 shadow-sm">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-app-ink text-[15px] font-extrabold text-white">S</span>
          <div className="min-w-0">
            <div className="line-clamp-1 text-[13.5px] font-bold">{title || "Title"}</div>
            <div className="line-clamp-2 text-[12.5px] leading-[1.35] text-app-ink-soft">{body || "Your message shows here."}</div>
            <div className="mt-1 text-[11px] text-app-ink-faint">app.shopinbos.com</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewCards({ overview }: { overview: Overview }) {
  const active = overview.devices.reduce((sum, row) => sum + row.active, 0);
  const sum = (key: "active" | "seen7" | "seen30", filter: (row: Overview["devices"][number]) => boolean = () => true) => overview.devices.filter(filter).reduce((total, row) => total + row[key], 0);
  const platforms = ["android", "ios", "web"];
  const roles = [...new Set(overview.devices.map((row) => row.role))].sort((a, b) => Object.keys(ROLE_LABEL).indexOf(a) - Object.keys(ROLE_LABEL).indexOf(b));
  const health = overview.health;
  const delivered = health.ok + health.error + health.expired;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="grid content-start gap-3 p-4 sm:p-5">
        <CardHead title="Devices" sub={`${n(active)} phones and browsers can get a push. Seen = the app or site was opened.`} />
        <StatGrid>
          <StatTile tone="card" label="Active" value={n(active)} hint={`${n(overview.devices.reduce((s, r) => s + r.total, 0) - active)} switched off`} />
          {platforms.map((platform) => (
            <StatTile key={platform} tone="card" label={PLATFORM_LABEL[platform]} value={n(sum("active", (row) => row.platform === platform))} hint={`${n(sum("seen7", (row) => row.platform === platform))} seen in 7 days`} />
          ))}
        </StatGrid>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.12em] text-app-ink-soft">
                <th className="py-1.5 font-mono font-medium">Role</th>
                <th className="py-1.5 text-right font-mono font-medium">Active</th>
                <th className="py-1.5 text-right font-mono font-medium">Seen 7 days</th>
                <th className="py-1.5 text-right font-mono font-medium">Seen 30 days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line">
              {roles.map((role) => (
                <tr key={role}>
                  <td className="py-1.5 font-semibold">{ROLE_LABEL[role] ?? role}</td>
                  <td className="py-1.5 text-right font-mono">{n(sum("active", (row) => row.role === role))}</td>
                  <td className="py-1.5 text-right font-mono">{n(sum("seen7", (row) => row.role === role))}</td>
                  <td className="py-1.5 text-right font-mono">{n(sum("seen30", (row) => row.role === role))}</td>
                </tr>
              ))}
              {!roles.length ? (
                <tr><td colSpan={4} className="py-3 text-app-ink-soft">No phones or browsers yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="grid content-start gap-3 p-4 sm:p-5">
        <CardHead title="Delivery health, last 7 days" sub={`Phone receipts last checked ${when(overview.receipts.lastChecked)}${overview.receipts.cronLastRun ? ` · receipts job last ran ${when(overview.receipts.cronLastRun)}${overview.receipts.cronStatus && overview.receipts.cronStatus !== "succeeded" ? ` (${overview.receipts.cronStatus})` : ""}` : ""}.`} />
        <StatGrid>
          <StatTile tone="card" label="Delivered" value={n(health.ok)} hint={delivered ? `${Math.round((health.ok / delivered) * 100)}% of checked` : "Nothing checked yet"} />
          <StatTile tone="card" label="Errors" value={n(health.error)} />
          <StatTile tone="card" label="No receipt" value={n(health.expired)} hint="Expired after a day" />
          <StatTile tone="card" label="Waiting" value={n(health.waiting + health.held)} hint={health.held ? `${n(health.held)} held for quiet hours` : "Receipt not in yet"} />
        </StatGrid>
        {overview.topErrors.length ? (
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            {overview.topErrors.map((row) => (
              <li key={row.error} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-mono text-[12px] text-app-danger">{row.error}</span>
                <span className="shrink-0 font-mono">{n(row.count)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-app-ink-soft">No push errors in the last 7 days.</p>
        )}
      </Card>
    </div>
  );
}

function History({ rows, busy, onOpen, onAction }: { rows: CampaignView[]; busy: string | null; onOpen: (row: CampaignView) => void; onAction: (row: CampaignView, action: "cancel" | "resend" | "delete") => void }) {
  return (
    <Card className="grid gap-0 p-0">
      <div className="border-b border-app-line px-4 py-3 sm:px-5">
        <h2 className="m-0 text-[16px] font-extrabold">Campaigns</h2>
        <p className="m-0 text-[12.5px] text-app-ink-soft">Sent = handed to the phone or browser push service · Delivered = the phone confirmed it (browsers count as delivered when accepted) · Opened = tapped.</p>
      </div>
      {rows.length ? (
        <ul className="m-0 list-none divide-y divide-app-line p-0">
          {rows.map((row) => {
            const status = row.status as CampaignStatus;
            return (
              <li key={row.id} className="grid gap-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-[14.5px] font-bold">{row.title}</span>
                    <Pill tone={STATUS_TONE[row.status] ?? "muted"} dot>{STATUS_LABEL[status] ?? row.status}</Pill>
                    {row.urgent ? <Pill tone="danger">Urgent</Pill> : null}
                    {row.overrideLimit ? <Pill tone="warning">Over the daily limit</Pill> : null}
                  </div>
                  <p className="m-0 truncate text-[12.5px] text-app-ink-soft">{row.body}</p>
                  <p className="m-0 text-[12.5px] text-app-ink-soft">
                    {describeAudience(row.audience)}
                    {row.status === "scheduled" && row.scheduledAt ? ` · goes out ${when(row.scheduledAt)}` : ""}
                    {row.sentAt ? ` · sent ${when(row.sentAt)}` : row.startedAt ? ` · started ${when(row.startedAt)}` : ""}
                    {row.status === "cancelled" ? ` · cancelled ${when(row.cancelledAt)}` : ""}
                    {row.status === "draft" ? ` · saved ${when(row.updatedAt)}${row.testedAt ? ", tested" : ""}` : ""}
                    {` · by ${row.sentByName ?? row.createdByName ?? "an admin"}`}
                  </p>
                  {row.status !== "draft" && row.status !== "cancelled" ? (
                    <p className="m-0 font-mono text-[12px] text-app-ink-soft">
                      {n(row.targetedCount)} targeted · {n(row.notifiedCount)} told{row.failedCount ? ` (${n(row.failedCount)} failed)` : ""} · {n(row.pushSent)} pushes sent · {n(row.pushOk)} delivered · {n(row.pushErrors)} errors · {n(row.openedCount)} opened
                    </p>
                  ) : null}
                  {row.lastError ? <p className="m-0 text-[12.5px] font-semibold text-app-danger">{row.lastError}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <PillButton tone="white" size="sm" onClick={() => onOpen(row)}>{row.status === "draft" ? "Edit" : "View"}</PillButton>
                  {row.status === "scheduled" ? <PillButton tone="white" size="sm" busy={busy === `cancel-${row.id}`} onClick={() => onAction(row, "cancel")}>Cancel</PillButton> : null}
                  {row.status === "sent" && !row.resentAt && (row.pushErrors > 0 || row.failedCount > 0) ? (
                    <PillButton tone="white" size="sm" busy={busy === `resend-${row.id}`} onClick={() => onAction(row, "resend")}>Resend to the failed ones</PillButton>
                  ) : null}
                  {row.status === "draft" || row.status === "cancelled" ? <PillButton tone="ghost" size="sm" busy={busy === `delete-${row.id}`} onClick={() => onAction(row, "delete")}>Delete</PillButton> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 px-4 py-6 text-[14px] text-app-ink-soft sm:px-5">No campaigns yet. Write one above, send yourself a test, then send it.</p>
      )}
    </Card>
  );
}
