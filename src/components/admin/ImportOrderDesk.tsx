"use client";

import { useRef, useState, type ReactNode } from "react";
import { Card, CardHead, Pill, SplitLayout } from "@/components/app-kit";
import { Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { friendlyError } from "@/lib/errors/report-client";
import {
  IMPORT_SOURCE_LABEL,
  IMPORT_STATUS_LABEL,
  IMPORT_STATUS_TONE,
  IMPORT_STEPS,
  PARTNER_NEXT,
  importStepIndex,
  isImportStatus,
  parseImportEvents,
  quoteTotals,
  stepTimes,
  type ImportSource,
  type ImportStatus,
} from "@/lib/imports/pure";

export interface DeskOrder {
  id: string;
  ref: string;
  source: string;
  title: string;
  link: string | null;
  productRef: string | null;
  photoUrl: string | null;
  quantity: number | null;
  shipping: string;
  notes: string | null;
  destination: string | null;
  status: string;
  unitPrice: number | null;
  goodsTotal: number | null;
  freight: number | null;
  customs: number | null;
  serviceFee: number | null;
  total: number | null;
  quoteNote: string | null;
  quoteValidUntil: string | null;
  estimatedArrival: string | null;
  paymentUrl: string | null;
  quotedAt: string | null;
  acceptedAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  declineReason: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  qcPhotos: string[];
  partnerNote: string | null;
  teamNotes: string | null;
  externalId: string | null;
  events: unknown;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; slug: string; city: string | null } | null;
}

const naira = (value: number | null | undefined) => `₦${Math.round(value ?? 0).toLocaleString("en-NG")}`;
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");
const dayInput = (value: string | null) => (value ? value.slice(0, 10) : "");
const num = (value: string) => (value.trim() === "" ? 0 : Number(value.replace(/[^\d.]/g, "")));

/** Admin › China imports › one import: the sourcing partner's desk. */
export function ImportOrderDesk({ initial }: { initial: DeskOrder }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const status: ImportStatus = isImportStatus(order.status) ? order.status : "requested";
  const quoteEditable = status === "requested" || (status === "quoted" && !order.paidAt);

  async function call(label: string, url: string, init: RequestInit, done?: string) {
    setBusy(label);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch(url, init);
      const json = (await response.json().catch(() => null)) as { data?: Partial<DeskOrder> & { events?: unknown }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't save.");
      const data = json.data;
      setOrder((current) => ({ ...current, ...normalise(data), store: current.store }));
      if (done) setSaved(done);
      return true;
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err) : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const patch = (label: string, body: Record<string, unknown>, done?: string) =>
    call(label, `/api/admin/imports/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, done);

  return (
    <div className="grid gap-4">
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">{saved}</Notice> : null}
      <SplitLayout
        main={
          <>
            <RequestCard order={order} status={status} />
            {quoteEditable ? (
              <QuoteForm order={order} busy={busy === "quote"} onSend={(body) => patch("quote", { action: "quote", ...body }, status === "quoted" ? "Updated quote sent to the seller." : "Quote sent. The seller has an alert to accept it.")} />
            ) : (
              <QuoteSummary order={order} />
            )}
            <ProgressCard order={order} status={status} busy={busy} onAdvance={(body) => patch("advance", { action: "advance", ...body }, "Done. The seller has been told.")} />
            <QcPhotos
              order={order}
              busy={busy === "photos"}
              onUpload={(files) => {
                const form = new FormData();
                for (const file of files) form.append("photo", file);
                return call("photos", `/api/admin/imports/${order.id}/photos`, { method: "POST", body: form });
              }}
              onRemove={(url) => call("photos", `/api/admin/imports/${order.id}/photos?url=${encodeURIComponent(url)}`, { method: "DELETE" })}
            />
          </>
        }
        side={
          <>
            <StatusCard order={order} status={status} />
            <DetailsCard order={order} busy={busy === "details"} onSave={(body) => patch("details", { action: "details", ...body }, "Saved.")} />
            {status !== "in_stock" && status !== "cancelled" && status !== "declined" ? (
              <CancelCard busy={busy === "cancel"} paid={Boolean(order.paidAt)} onCancel={(reason) => patch("cancel", { action: "cancel", reason }, "Cancelled. The seller has been told.")} />
            ) : null}
          </>
        }
      />
    </div>
  );
}

/** API rows carry Dates as JSON strings already; keep only the fields the desk shows. */
function normalise(data: Partial<DeskOrder>): Partial<DeskOrder> {
  const { store: _store, ...rest } = data;
  return rest;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-app-line py-2 text-[14px] last:border-0">
      <dt className="text-app-ink-soft">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right font-semibold">{children}</dd>
    </div>
  );
}

function RequestCard({ order, status }: { order: DeskOrder; status: ImportStatus }) {
  return (
    <Card className="p-5">
      <CardHead title="What the seller wants" sub={`${IMPORT_SOURCE_LABEL[order.source as ImportSource] ?? order.source} · ${IMPORT_STATUS_LABEL[status]}`} />
      <div className="mt-4 grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="grid aspect-square place-items-center overflow-hidden rounded-[16px] border border-app-line bg-app-canvas">
          {order.photoUrl ? (
            <a href={order.photoUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.photoUrl} alt="The seller's photo" className="h-full w-full object-cover" />
            </a>
          ) : (
            <Icon name="package" size={34} className="text-app-ink-faint" />
          )}
        </div>
        <dl className="m-0 grid content-start">
          <Row label="Product">{order.title}</Row>
          {order.link ? (
            <Row label="Link">
              <a href={order.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                {order.source === "shopkonfam" ? "Open on ShopKonfam" : "Open on 1688"} <Icon name="link" size={13} />
              </a>
            </Row>
          ) : null}
          {order.productRef ? <Row label="Product ID">{order.productRef}</Row> : null}
          <Row label="Quantity">{order.quantity ? `${order.quantity.toLocaleString("en-NG")} units` : "To confirm"}</Row>
          <Row label="Shipping">{order.shipping === "sea" ? "Sea (6 to 8 weeks)" : "Air (10 to 14 days)"}</Row>
          <Row label="Deliver to">{[order.store?.name, order.destination].filter(Boolean).join(", ") || "-"}</Row>
        </dl>
      </div>
      {order.notes ? <p className="m-0 mt-4 whitespace-pre-line rounded-[14px] bg-app-canvas p-3 text-[14px]"><span className="font-bold">Seller&apos;s notes: </span>{order.notes}</p> : null}
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 content-start gap-1.5 text-[13px] font-bold">
      {label}
      {children}
      {hint ? <span className="text-[12px] font-normal text-app-ink-soft">{hint}</span> : null}
    </label>
  );
}

function QuoteForm({ order, busy, onSend }: { order: DeskOrder; busy: boolean; onSend: (body: Record<string, unknown>) => void }) {
  const [quantity, setQuantity] = useState(String(order.quantity ?? ""));
  const [unitPrice, setUnitPrice] = useState(order.unitPrice ? String(order.unitPrice) : "");
  const [freight, setFreight] = useState(order.freight ? String(order.freight) : "");
  const [customs, setCustoms] = useState(order.customs ? String(order.customs) : "");
  const [serviceFee, setServiceFee] = useState(order.serviceFee ? String(order.serviceFee) : "");
  const [validDays, setValidDays] = useState("5");
  const [arrival, setArrival] = useState(dayInput(order.estimatedArrival));
  const [paymentUrl, setPaymentUrl] = useState(order.paymentUrl ?? "");
  const [note, setNote] = useState(order.quoteNote ?? "");
  const totals = quoteTotals({ unitPrice: num(unitPrice), quantity: num(quantity), freight: num(freight), customs: num(customs), serviceFee: num(serviceFee) });
  const ready = num(unitPrice) > 0 && num(quantity) >= 1;

  return (
    <Card className="p-5">
      <CardHead title={order.status === "quoted" ? "Update the quote" : "Send a quote"} sub="In naira, delivered to the seller, customs included. The seller sees each line." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Quantity (units)"><TextInput inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
        <Field label="Price per unit (₦)"><TextInput inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="2,450" /></Field>
        <Field label="Shipping to Nigeria (₦)" hint={order.shipping === "sea" ? "Sea freight" : "Air freight"}><TextInput inputMode="decimal" value={freight} onChange={(event) => setFreight(event.target.value)} /></Field>
        <Field label="Customs and clearing (₦)"><TextInput inputMode="decimal" value={customs} onChange={(event) => setCustoms(event.target.value)} /></Field>
        <Field label="Service fee (₦)" hint="Sourcing, QC and handling"><TextInput inputMode="decimal" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)} /></Field>
        <Field label="Quote is good for">
          <select value={validDays} onChange={(event) => setValidDays(event.target.value)} className="h-[48px] rounded-[14px] border border-app-line bg-white px-3 text-[15px]">
            {["2", "3", "5", "7", "14"].map((value) => <option key={value} value={value}>{value} days</option>)}
          </select>
        </Field>
        <Field label="Expected delivery date"><TextInput type="date" value={arrival} onChange={(event) => setArrival(event.target.value)} /></Field>
        <Field label="Payment link" hint="Your ShopKonfam payment page for this order. The seller pays you here."><TextInput type="url" value={paymentUrl} onChange={(event) => setPaymentUrl(event.target.value)} placeholder="https://shopkonfam.com/pay/..." /></Field>
      </div>
      <div className="mt-3">
        <Field label="Note for the seller (optional)"><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Colours available: black, cream. MOQ 50." className="rounded-[14px] border border-app-line px-3 py-2 text-[14px] font-normal" /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-app-canvas p-4">
        <div className="text-[14px]">
          <div className="text-app-ink-soft">Goods {naira(totals.goods)} · {naira(totals.landedUnit)} per unit landed</div>
          <div className="text-[22px] font-extrabold">{naira(totals.total)}</div>
        </div>
        <PillButton
          size="md"
          busy={busy}
          disabled={!ready}
          onClick={() =>
            onSend({
              quantity: Math.floor(num(quantity)),
              unitPrice: num(unitPrice),
              freight: num(freight),
              customs: num(customs),
              serviceFee: num(serviceFee),
              validDays: Number(validDays),
              estimatedArrival: arrival || null,
              paymentUrl: paymentUrl.trim() || null,
              quoteNote: note.trim() || null,
            })
          }
        >
          <Icon name="send" size={16} /> {order.status === "quoted" ? "Send updated quote" : "Send quote"}
        </PillButton>
      </div>
    </Card>
  );
}

function QuoteSummary({ order }: { order: DeskOrder }) {
  if (!order.total) return null;
  return (
    <Card className="p-5">
      <CardHead title="Quote" sub={order.paidAt ? `Paid ${day(order.paidAt)}` : order.declineReason ? `Declined: ${order.declineReason}` : `Sent ${day(order.quotedAt)}`} />
      <dl className="m-0 mt-3 grid">
        <Row label={`Goods (${order.quantity ?? 0} × ${naira(order.unitPrice)})`}>{naira(order.goodsTotal)}</Row>
        <Row label="Shipping">{naira(order.freight)}</Row>
        <Row label="Customs and clearing">{naira(order.customs)}</Row>
        <Row label="Service fee">{naira(order.serviceFee)}</Row>
        <Row label="Total">{naira(order.total)}</Row>
      </dl>
    </Card>
  );
}

function ProgressCard({ order, status, busy, onAdvance }: { order: DeskOrder; status: ImportStatus; busy: string | null; onAdvance: (body: Record<string, unknown>) => void }) {
  const next = PARTNER_NEXT[status];
  const times = stepTimes(parseImportEvents(order.events));
  const current = importStepIndex(status);
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [arrival, setArrival] = useState(dayInput(order.estimatedArrival));
  const [note, setNote] = useState(order.partnerNote ?? "");
  const needsPhotos = next?.to === "checked" && order.qcPhotos.length === 0;
  const waitingOnSeller = status === "quoted" && !order.acceptedAt;

  return (
    <Card className="p-5">
      <CardHead title="Progress" sub="Move it on as each step happens. The seller gets an alert every time." />
      <ol className="m-0 mt-4 grid list-none gap-0 p-0">
        {IMPORT_STEPS.map((step, index) => {
          const done = current >= 0 && index < current;
          const here = index === current;
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {index < IMPORT_STEPS.length - 1 ? <span className={cx("absolute left-[9px] top-5 h-[calc(100%-12px)] w-0.5", done ? "bg-app-success" : "bg-app-line")} /> : null}
              <span className={cx("relative z-[1] mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", done || (here && status === "in_stock") ? "bg-app-success text-white" : here ? "bg-app-accent text-white" : "border-2 border-app-line bg-white")}>
                {done || (here && status === "in_stock") ? <Icon name="check" size={12} /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cx("text-[14.5px]", here ? "font-extrabold" : done ? "font-semibold" : "text-app-ink-soft")}>{step.label}</div>
                {times[step.key] ? <div className="text-[12.5px] text-app-ink-soft">{day(times[step.key] ?? null)}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {next ? (
        <div className="mt-5 grid gap-3 rounded-[16px] border border-app-line p-4">
          <div>
            <div className="text-[15px] font-extrabold">Next: {next.label}</div>
            <div className="text-[13px] text-app-ink-soft">{waitingOnSeller ? "The seller hasn't accepted the quote yet. Mark it paid only once their money reaches you." : next.help}</div>
          </div>
          {next.to === "shipping" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Carrier"><TextInput value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="DHL, Ethiopian Cargo" /></Field>
              <Field label="Tracking number"><TextInput value={tracking} onChange={(event) => setTracking(event.target.value)} /></Field>
              <Field label="Arrives about"><TextInput type="date" value={arrival} onChange={(event) => setArrival(event.target.value)} /></Field>
            </div>
          ) : null}
          <Field label="Note for the seller (optional)" hint='Shown under the step, e.g. "Lands in Lagos about 16 Nov".'>
            <TextInput value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <PillButton
            size="md"
            className="w-fit"
            busy={busy === "advance"}
            disabled={needsPhotos}
            onClick={() =>
              onAdvance({
                to: next.to,
                partnerNote: note.trim() || null,
                ...(next.to === "shipping" ? { carrier: carrier.trim() || null, trackingNumber: tracking.trim() || null, estimatedArrival: arrival || null } : {}),
              })
            }
          >
            <Icon name="check" size={16} /> {next.label}
          </PillButton>
          {needsPhotos ? <p className="m-0 text-[13px] font-bold text-app-danger">Add QC photos below first.</p> : null}
        </div>
      ) : status === "requested" ? (
        <p className="m-0 mt-4 text-[13.5px] text-app-ink-soft">Send a quote to start.</p>
      ) : null}
    </Card>
  );
}

function QcPhotos({ order, busy, onUpload, onRemove }: { order: DeskOrder; busy: boolean; onUpload: (files: File[]) => Promise<boolean>; onRemove: (url: string) => Promise<boolean> }) {
  const input = useRef<HTMLInputElement>(null);
  const paid = Boolean(order.paidAt);
  return (
    <Card className="p-5">
      <CardHead
        title={`QC photos · ${order.qcPhotos.length}/12`}
        sub="Photos of the actual goods in Guangzhou, before they ship. The seller sees them in My imports."
        action={
          paid ? (
            <PillButton size="sm" tone="white" busy={busy} onClick={() => input.current?.click()}>
              <Icon name="upload" size={14} /> Add photos
            </PillButton>
          ) : null
        }
      />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={async (event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (files.length) await onUpload(files);
        }}
      />
      {order.qcPhotos.length ? (
        <ul className="m-0 mt-4 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4">
          {order.qcPhotos.map((url) => (
            <li key={url} className="group relative aspect-square overflow-hidden rounded-[12px] border border-app-line">
              <a href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="QC photo" className="h-full w-full object-cover" />
              </a>
              <button type="button" aria-label="Remove photo" disabled={busy} onClick={() => void onRemove(url)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 shadow">
                <Icon name="x" size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-3 text-[13.5px] text-app-ink-soft">{paid ? "No photos yet." : "You can add photos once it's paid."}</p>
      )}
    </Card>
  );
}

function StatusCard({ order, status }: { order: DeskOrder; status: ImportStatus }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[16px] font-extrabold">Status</h2>
        <Pill tone={IMPORT_STATUS_TONE[status]} dot>{status === "quoted" && order.acceptedAt ? "Accepted, awaiting payment" : IMPORT_STATUS_LABEL[status]}</Pill>
      </div>
      <dl className="m-0 mt-3 grid">
        <Row label="Total">{order.total ? naira(order.total) : "No quote yet"}</Row>
        {order.quoteValidUntil && status === "quoted" ? <Row label="Quote good until">{day(order.quoteValidUntil)}</Row> : null}
        {order.acceptedAt ? <Row label="Seller accepted">{day(order.acceptedAt)}</Row> : null}
        {order.paidAt ? <Row label="Paid">{day(order.paidAt)}</Row> : null}
        {order.estimatedArrival ? <Row label="Expected delivery">{day(order.estimatedArrival)}</Row> : null}
        {order.deliveredAt ? <Row label="Delivered">{day(order.deliveredAt)}</Row> : null}
        {order.declineReason ? <Row label="Seller's reason">{order.declineReason}</Row> : null}
      </dl>
    </Card>
  );
}

function DetailsCard({ order, busy, onSave }: { order: DeskOrder; busy: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const [carrier, setCarrier] = useState(order.carrier ?? "");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [arrival, setArrival] = useState(dayInput(order.estimatedArrival));
  const [partnerNote, setPartnerNote] = useState(order.partnerNote ?? "");
  const [externalId, setExternalId] = useState(order.externalId ?? "");
  const [teamNotes, setTeamNotes] = useState(order.teamNotes ?? "");
  return (
    <Card className="p-5">
      <CardHead title="Tracking and notes" />
      <div className="mt-3 grid gap-3">
        <Field label="Carrier"><TextInput value={carrier} onChange={(event) => setCarrier(event.target.value)} /></Field>
        <Field label="Tracking number"><TextInput value={tracking} onChange={(event) => setTracking(event.target.value)} /></Field>
        <Field label="Expected delivery"><TextInput type="date" value={arrival} onChange={(event) => setArrival(event.target.value)} /></Field>
        <Field label="Note the seller sees"><TextInput value={partnerNote} maxLength={200} onChange={(event) => setPartnerNote(event.target.value)} /></Field>
        <Field label="ShopKonfam order ID" hint="Your own reference, so both systems match."><TextInput value={externalId} onChange={(event) => setExternalId(event.target.value)} /></Field>
        <Field label="Team notes" hint="Only ShopKonfam and the Shopinbos team see these.">
          <textarea rows={3} value={teamNotes} onChange={(event) => setTeamNotes(event.target.value)} className="rounded-[14px] border border-app-line px-3 py-2 text-[14px] font-normal" />
        </Field>
        <PillButton
          size="sm"
          tone="white"
          className="w-fit"
          busy={busy}
          onClick={() => onSave({ carrier: carrier.trim() || null, trackingNumber: tracking.trim() || null, estimatedArrival: arrival || null, partnerNote: partnerNote.trim() || null, externalId: externalId.trim() || null, teamNotes: teamNotes.trim() || null })}
        >
          Save
        </PillButton>
      </div>
    </Card>
  );
}

function CancelCard({ busy, paid, onCancel }: { busy: boolean; paid: boolean; onCancel: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Card className="p-5">
      <CardHead title="Can't fill this order?" sub={paid ? "Cancel it and refund the seller from your side." : "Tell the seller why, so they can try something else."} />
      {open ? (
        <div className="mt-3 grid gap-3">
          <Field label="Reason the seller sees"><TextInput value={reason} onChange={(event) => setReason(event.target.value)} placeholder="The factory has stopped making this item." /></Field>
          <div className="flex gap-2">
            <PillButton size="sm" busy={busy} disabled={reason.trim().length < 3} onClick={() => onCancel(reason.trim())}>Cancel import</PillButton>
            <PillButton size="sm" tone="ghost" onClick={() => setOpen(false)}>Keep it</PillButton>
          </div>
        </div>
      ) : (
        <PillButton size="sm" tone="white" className="mt-3" onClick={() => setOpen(true)}>Cancel this import</PillButton>
      )}
    </Card>
  );
}
