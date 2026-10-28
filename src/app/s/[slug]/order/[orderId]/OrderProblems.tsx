"use client";

import { useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { Panel } from "@/components/storefront/shopper/ShopperShell";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import { RETURN_REASONS, type ReturnReason } from "@shared/fault-matrix";

// Who pays when things go wrong, on the customer's order page (shared/fault-matrix.ts): a part past its ship-by date
// they can cancel for a full refund, what was decided on problems so far, a return when the store takes them, and the
// photos for "Report a problem" or a return. Access is the order's private id, like the page itself.

export interface OrderFaults {
  late: Array<{ id: string; shipBy: string; items: string[] }>;
  outcomes: Array<{ id: string; label: string; line: string | null; createdAt: string }>;
  returns: {
    allowed: boolean;
    windowDays: number;
    payer: "customer" | "seller";
    problem: string | null;
    request: { id: string; status: string; reason: string; refundKobo: number; declineReason: string | null; createdAt: string } | null;
  };
}

const api = (slug: string, orderId: string, path: string) => `/api/public/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}/${path}`;

async function send(url: string, body: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: json?.error?.message ?? "" };
    return { ok: true, data: json?.data ?? {} };
  } catch {
    return { ok: false, error: "" };
  }
}

/** Up to four photos (the wrong item, the damage), uploaded as they're picked. */
export function PhotoPicker({ theme, slug, orderId, photos, onChange }: { theme: ShopperTheme; slug: string; orderId: string; photos: string[]; onChange: (photos: string[]) => void }) {
  const t = useT("faults");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, 4 - photos.length);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    const added: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(api(slug, orderId, "photos"), { method: "POST", body: form }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (res?.ok && json?.data?.url) added.push(json.data.url);
      else setError(json?.error?.message ?? t("photos.failed"));
    }
    onChange([...photos, ...added]);
    setBusy(false);
  }
  return (
    <div className="grid gap-2">
      <span className="text-[14px] font-medium">{t("photos.label")}</span>
      <div className="flex flex-wrap gap-2">
        {photos.map((url) => (
          <span key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={t("photos.yours")} className="h-[72px] w-[72px] rounded-[12px] border object-cover" style={{ borderColor: theme.border }} />
            <button type="button" onClick={() => onChange(photos.filter((item) => item !== url))} aria-label={t("photos.remove")} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-[12px] shadow">✕</button>
          </span>
        ))}
        {photos.length < 4 ? (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="grid h-[72px] w-[72px] place-items-center rounded-[12px] border border-dashed text-[12px] font-semibold disabled:opacity-60" style={{ borderColor: theme.border }}>
            <span className="grid justify-items-center gap-1"><Icon name="image" size={18} />{busy ? t("photos.uploading") : t("photos.add")}</span>
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => void pick(event)} tabIndex={-1} aria-hidden />
      {error ? <p role="alert" className="m-0 text-[13px]" style={{ color: "#B42318" }}>{error}</p> : null}
    </div>
  );
}

/** A supplier's parcel past its ship-by date: wait, or cancel that part for a full refund. */
export function LateParts({ theme, slug, orderId, late }: { theme: ShopperTheme; slug: string; orderId: string; late: OrderFaults["late"] }) {
  const t = useT("faults");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  if (!late.length) return null;
  async function cancel(id: string) {
    setBusy(id);
    setError("");
    const result = await send(api(slug, orderId, "cancel"), { supplierOrderId: id });
    setBusy(null);
    if (!result.ok) return setError(result.error || t("error.generic"));
    setDone((prev) => ({ ...prev, [id]: String(result.data.message ?? t("late.cancelled")) }));
  }
  return (
    <Panel theme={theme} className="grid gap-3 p-5" aria-labelledby="late-heading" data-testid="late-parts">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "#FFF4E0", color: "#7A4A00" }}><Icon name="clock" size={18} /></span>
        <div>
          <h2 id="late-heading" className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>{t("late.title")}</h2>
          <p className="mt-1 text-[14.5px] leading-6" style={{ color: theme.muted }}>{t("late.body")}</p>
        </div>
      </div>
      {late.map((part) => (
        <div key={part.id} className="grid gap-2 rounded-[14px] border p-4" style={{ borderColor: theme.border }}>
          <p className="m-0 text-[15px] font-medium">{part.items.join(", ")}</p>
          <p className="m-0 text-[13.5px]" style={{ color: theme.muted }}>{t("late.shipBy", { date: new Date(part.shipBy).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" }) })}</p>
          {done[part.id] ? (
            <p role="status" className="m-0 rounded-[12px] px-3 py-2 text-[14px] font-semibold" style={{ background: "#E7F5EC", color: "#14532D" }}>{done[part.id]}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void cancel(part.id)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center rounded-full px-5 text-[14.5px] font-semibold disabled:opacity-60" style={{ background: theme.cta, color: theme.ctaText }}>
                {busy === part.id ? t("late.cancelling") : t("late.cancel")}
              </button>
              <span className="text-[13.5px]" style={{ color: theme.muted }}>{t("late.orWait")}</span>
            </div>
          )}
        </div>
      ))}
      {error ? <p role="alert" className="m-0 text-[13.5px]" style={{ color: "#B42318" }}>{error}</p> : null}
    </Panel>
  );
}

/** What was decided so far (a refund, a replacement), in the customer's words. */
export function OrderOutcomes({ theme, outcomes }: { theme: ShopperTheme; outcomes: OrderFaults["outcomes"] }) {
  const t = useT("faults");
  const shown = outcomes.filter((row) => row.line);
  if (!shown.length) return null;
  return (
    <Panel theme={theme} className="grid gap-2 p-5" aria-labelledby="outcome-heading" data-testid="order-outcomes">
      <h2 id="outcome-heading" className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>{t("outcome.title")}</h2>
      {shown.map((row) => (
        <div key={row.id} className="rounded-[14px] px-4 py-3" style={{ background: theme.paper }}>
          <p className="m-0 text-[13px] font-semibold" style={{ color: theme.muted }}>{row.label}</p>
          <p className="m-0 mt-0.5 text-[15px] font-medium">{row.line}</p>
        </div>
      ))}
      <p className="m-0 text-[13px]" style={{ color: theme.muted }}>{t("outcome.note")}</p>
    </Panel>
  );
}

/** "Return it": when the store takes returns, within its window, once delivered. */
export function ReturnPanel({ theme, slug, orderId, returns, storeName }: { theme: ShopperTheme; slug: string; orderId: string; returns: OrderFaults["returns"]; storeName: string }) {
  const t = useT("faults");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const request = returns.request;
  if (!returns.allowed && !request) return null;
  if (request || sent) {
    const status = sent ? "requested" : request!.status;
    return (
      <Panel theme={theme} className="grid gap-1 p-5" aria-live="polite" data-testid="return-status">
        <h2 className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>{t.dynamic(`return.status.${status}`, status)}</h2>
        <p className="m-0 text-[14.5px] leading-6" style={{ color: theme.muted }}>
          {status === "declined" && request?.declineReason ? t("return.declinedWhy", { store: storeName, reason: request.declineReason }) : t.dynamic(`return.statusBody.${status}`, "", { store: storeName })}
        </p>
      </Panel>
    );
  }
  if (returns.problem) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return setError(t("return.pickReason"));
    setBusy(true);
    setError("");
    const result = await send(api(slug, orderId, "return"), { reason, message: message.trim() || undefined, photos });
    setBusy(false);
    if (!result.ok) return setError(result.error || t("error.generic"));
    setSent(true);
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="justify-self-start py-1 text-[14.5px] font-semibold underline underline-offset-4">
        {t("return.open", { days: returns.windowDays })}
      </button>
    );
  }
  return (
    <Panel theme={theme} className="p-5" aria-labelledby="return-heading" data-testid="return-form">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div>
          <h2 id="return-heading" className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>{t("return.title")}</h2>
          <p className="mt-1 text-[14px] leading-6" style={{ color: theme.muted }}>{returns.payer === "seller" ? t("return.howSellerPays", { store: storeName }) : t("return.howYouPay", { store: storeName })}</p>
        </div>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="sr-only">{t("return.why")}</legend>
          {RETURN_REASONS.map((entry) => (
            <label key={entry} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border px-4 text-[15px]" style={{ borderColor: reason === entry ? theme.ink : theme.border }}>
              <input type="radio" name="return-reason" checked={reason === entry} onChange={() => { setReason(entry); setError(""); }} className="h-5 w-5 shrink-0" style={{ accentColor: theme.ink }} />
              {t.dynamic(`return.reason.${entry}`, entry)}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1.5 text-[14px] font-medium">
          {t("return.more")}
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} maxLength={1000} className="block w-full rounded-[14px] border bg-white px-4 py-3 text-[16px] font-normal" style={{ borderColor: theme.border, color: "#16141F" }} />
        </label>
        <PhotoPicker theme={theme} slug={slug} orderId={orderId} photos={photos} onChange={setPhotos} />
        {error ? <p role="alert" className="m-0 text-[13.5px]" style={{ color: "#B42318" }}>{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center rounded-full px-6 text-[15px] font-semibold disabled:opacity-60" style={{ background: theme.cta, color: theme.ctaText }}>
            {busy ? t("return.sending") : t("return.send")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 text-[14px] font-medium underline underline-offset-4">{t("cancel")}</button>
        </div>
      </form>
    </Panel>
  );
}
