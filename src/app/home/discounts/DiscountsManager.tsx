"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, type Tone } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, checkClass, formatDate, inputClass, selectClass } from "@/components/growth/kit";
import { describeDiscount, type DiscountConfig } from "@/lib/discounts";
import { naira } from "@shared/onboarding";
import { api, errorText } from "../marketing/_kit/client";

interface DiscountRow {
  id: string;
  name: string;
  code: string;
  type: string;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  status: string;
  config: DiscountConfig;
  orders: number;
  revenue: number;
  given: number;
}

interface CouponRow {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  status: string;
  revenue: number;
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "success", label: "Live" },
  scheduled: { tone: "info", label: "Scheduled" },
  draft: { tone: "muted", label: "Draft" },
  disabled: { tone: "muted", label: "Off" },
  expired: { tone: "warning", label: "Ended" },
  used: { tone: "muted", label: "Used" },
};

/** What a discount is doing right now, from its status and dates. */
function liveState(d: { status: string; startsAt: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number }) {
  const now = Date.now();
  if (d.status !== "active") return STATUS[d.status] ?? STATUS.draft;
  if (d.expiresAt && new Date(d.expiresAt).getTime() < now) return STATUS.expired;
  if (d.maxUses && d.usedCount >= d.maxUses) return { tone: "warning" as Tone, label: "Used up" };
  if (d.startsAt && new Date(d.startsAt).getTime() > now) return STATUS.scheduled;
  return STATUS.active;
}

/** datetime-local value in Lagos time (WAT, UTC+1). */
function lagosInput(iso: string | null) {
  return iso ? new Date(new Date(iso).getTime() + 3_600_000).toISOString().slice(0, 16) : "";
}

interface Draft {
  name: string;
  code: string;
  type: "percentage" | "fixed_amount" | "free_shipping" | "bogo";
  value: string;
  minOrder: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  automatic: boolean;
  buyQuantity: string;
  getQuantity: string;
  getPercent: string;
  productIds: string[];
  segmentId: string;
  oncePerCustomer: boolean;
}

function toDraft(row: DiscountRow | null, automatic: boolean): Draft {
  return {
    name: row?.name ?? "",
    code: row && !row.config.automatic ? row.code : "",
    type: (row?.type as Draft["type"]) ?? "percentage",
    value: row ? String(row.value) : "10",
    minOrder: row?.minOrder ? String(row.minOrder) : "",
    maxUses: row?.maxUses ? String(row.maxUses) : "",
    startsAt: lagosInput(row?.startsAt ?? null),
    expiresAt: lagosInput(row?.expiresAt ?? null),
    active: row ? row.status === "active" : true,
    automatic: row ? row.config.automatic : automatic,
    buyQuantity: String(row?.config.buyQuantity ?? 1),
    getQuantity: String(row?.config.getQuantity ?? 1),
    getPercent: String(row?.config.getPercent ?? 100),
    productIds: row?.config.productIds ?? [],
    segmentId: row?.config.segmentId ?? "",
    oncePerCustomer: row?.config.oncePerCustomer ?? false,
  };
}

function DiscountEditor({
  editing,
  automatic,
  segments,
  products,
  onClose,
  onSaved,
}: {
  editing: DiscountRow | null;
  automatic: boolean;
  segments: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(editing, automatic));
  const [scope, setScope] = useState(d.productIds.length ? "some" : "all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: d.name,
        code: d.automatic ? undefined : d.code,
        type: d.type,
        value: d.type === "free_shipping" ? 0 : d.type === "bogo" ? Number(d.getPercent) || 100 : Number(d.value),
        minOrder: d.minOrder ? Number(d.minOrder) : null,
        maxUses: d.maxUses ? Math.floor(Number(d.maxUses)) : null,
        startsAt: d.startsAt || null,
        expiresAt: d.expiresAt || null,
        status: d.active ? "active" : "disabled",
        config: {
          automatic: d.automatic,
          buyQuantity: Number(d.buyQuantity) || 1,
          getQuantity: Number(d.getQuantity) || 1,
          getPercent: d.type === "bogo" ? Number(d.getPercent) || 100 : null,
          productIds: scope === "some" ? d.productIds : [],
          segmentId: d.segmentId || null,
          oncePerCustomer: d.oncePerCustomer,
        },
      };
      const saved = editing ? await api<{ code: string }>(`/api/app/marketing/discounts/${editing.id}`, "PATCH", body) : await api<{ code: string }>("/api/app/marketing/discounts", "POST", body);
      onSaved(editing ? "Saved." : d.automatic ? `${d.name} is set up.` : `${saved.code} is ready.`);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${editing.name}` : d.automatic ? "New automatic offer" : "New discount code"} onClose={onClose} wide>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="d-name"><input id="d-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputClass} required maxLength={120} placeholder={d.automatic ? "Weekend sale" : "Welcome code"} /></Field>
          {d.automatic ? (
            <p className="m-0 self-end text-[13.5px] text-app-ink-soft">Applies at checkout without a code, when the order qualifies.</p>
          ) : (
            <Field label="Code shoppers type" htmlFor="d-code"><input id="d-code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} className={`${inputClass} font-mono`} required maxLength={40} placeholder="WEEKEND20" /></Field>
          )}
          <Field label="Kind" htmlFor="d-type">
            <select id="d-type" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as Draft["type"] })} className={selectClass}>
              <option value="percentage">Percentage off</option>
              <option value="fixed_amount">Amount off (₦)</option>
              <option value="free_shipping">Free delivery</option>
              <option value="bogo">Buy X get Y</option>
            </select>
          </Field>
          {d.type === "percentage" || d.type === "fixed_amount" ? (
            <Field label={d.type === "percentage" ? "Percent off" : "Naira off"} htmlFor="d-value"><input id="d-value" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} type="number" min="1" max={d.type === "percentage" ? 100 : undefined} className={inputClass} required /></Field>
          ) : null}
        </div>
        {d.type === "bogo" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-app-canvas p-3 text-[14px]">
            <span>Buy</span>
            <input aria-label="Buy quantity" type="number" min={1} value={d.buyQuantity} onChange={(e) => setD({ ...d, buyQuantity: e.target.value })} className={`${inputClass} w-[80px]`} />
            <span>get</span>
            <input aria-label="Get quantity" type="number" min={1} value={d.getQuantity} onChange={(e) => setD({ ...d, getQuantity: e.target.value })} className={`${inputClass} w-[80px]`} />
            <input aria-label="Percent off the extra items" type="number" min={1} max={100} value={d.getPercent} onChange={(e) => setD({ ...d, getPercent: e.target.value })} className={`${inputClass} w-[90px]`} />
            <span>% off (100 = free). The cheapest items are the free ones.</span>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Applies to" htmlFor="d-scope">
            <select id="d-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={selectClass}>
              <option value="all">Everything in the shop</option>
              <option value="some">Only some products</option>
            </select>
          </Field>
          <Field label="Who can use it" htmlFor="d-segment" hint={d.segmentId ? "Checked against the email at checkout." : undefined}>
            <select id="d-segment" value={d.segmentId} onChange={(e) => setD({ ...d, segmentId: e.target.value })} className={selectClass}>
              <option value="">Everyone</option>
              {segments.map((s) => <option key={s.id} value={s.id}>Segment: {s.name}</option>)}
            </select>
          </Field>
        </div>
        {scope === "some" ? (
          <div className="max-h-[200px] overflow-y-auto rounded-[16px] border border-app-line p-3">
            {products.length ? products.map((p) => (
              <label key={p.id} className="flex min-h-[38px] items-center gap-2.5 text-[14px]">
                <input type="checkbox" className={checkClass} checked={d.productIds.includes(p.id)} onChange={(e) => setD({ ...d, productIds: e.target.checked ? [...d.productIds, p.id] : d.productIds.filter((id) => id !== p.id) })} />
                <span className="truncate">{p.name}</span>
              </label>
            )) : <p className="m-0 text-[13px] text-app-ink-soft">No products yet.</p>}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Smallest order (₦)" htmlFor="d-min"><input id="d-min" value={d.minOrder} onChange={(e) => setD({ ...d, minOrder: e.target.value })} type="number" min="0" className={inputClass} placeholder="None" /></Field>
          <Field label="Total uses" htmlFor="d-max"><input id="d-max" value={d.maxUses} onChange={(e) => setD({ ...d, maxUses: e.target.value })} type="number" min="0" className={inputClass} placeholder="No limit" /></Field>
          <Field label="Starts (Lagos time)" htmlFor="d-start"><input id="d-start" value={d.startsAt} onChange={(e) => setD({ ...d, startsAt: e.target.value })} type="datetime-local" className={inputClass} /></Field>
          <Field label="Ends (Lagos time)" htmlFor="d-end"><input id="d-end" value={d.expiresAt} onChange={(e) => setD({ ...d, expiresAt: e.target.value })} type="datetime-local" className={inputClass} /></Field>
        </div>
        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={d.oncePerCustomer} onChange={(e) => setD({ ...d, oncePerCustomer: e.target.checked })} /> One use per customer (by email)</label>
        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] font-bold"><input type="checkbox" className={checkClass} checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Live (from the start time, if set)</label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving}>{editing ? "Save" : "Create"}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

function NewCoupons({ onCreated }: { onCreated: (codes: string[]) => void }) {
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState("10");
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const codes: string[] = [];
      for (let i = 0; i < Math.min(50, Math.max(1, Number(count) || 1)); i++) {
        const created = await api<{ code: string }>("/api/store/coupons", "POST", { action: "generate", type, value: Number(value), maxUses: 1 });
        codes.push(created.code);
      }
      onCreated(codes);
    } catch (createError) {
      setError(errorText(createError, "Couldn't make the codes."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHead title="Make one-use codes" sub="Random codes that work once each: for thank-you notes, influencers or making things right." />
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,120px)_auto] sm:items-end">
        <Field label="Kind" htmlFor="c-type">
          <select id="c-type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Amount off (₦)</option>
          </select>
        </Field>
        <Field label={type === "percentage" ? "Percent off" : "Naira off"} htmlFor="c-value"><input id="c-value" value={value} onChange={(e) => setValue(e.target.value)} type="number" min="1" className={inputClass} required /></Field>
        <Field label="How many" htmlFor="c-count"><input id="c-count" value={count} onChange={(e) => setCount(e.target.value)} type="number" min="1" max="50" className={inputClass} /></Field>
        <PillButton size="md" type="submit" busy={busy}><Icon name="plus" size={16} /> Make</PillButton>
      </form>
      {error ? <div className="mt-3"><Notice>{error}</Notice></div> : null}
    </Card>
  );
}

export function DiscountsManager({
  tab,
  startOpen,
  discounts,
  coupons,
  segments,
  products,
}: {
  tab: "codes" | "automatic" | "coupons";
  startOpen: boolean;
  discounts: DiscountRow[];
  coupons: CouponRow[];
  segments: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ editing: DiscountRow | null } | null>(startOpen && tab !== "coupons" ? { editing: null } : null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function toggle(discount: DiscountRow, on: boolean) {
    setNotice(null);
    try {
      await api(`/api/app/marketing/discounts/${discount.id}`, "PATCH", { status: on ? "active" : "disabled" });
      router.refresh();
    } catch (toggleError) {
      setNotice({ tone: "error", text: errorText(toggleError) });
    }
  }

  async function remove(discount: DiscountRow) {
    if (!window.confirm(`Delete ${discount.name}? Orders that used it keep their record.`)) return;
    try {
      await api(`/api/app/marketing/discounts/${discount.id}`, "DELETE");
      router.refresh();
    } catch (deleteError) {
      setNotice({ tone: "error", text: errorText(deleteError) });
    }
  }

  return (
    <div className="grid gap-4">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {tab !== "coupons" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" tone="accent" onClick={() => setEditor({ editing: null })}>
              <Icon name="plus" size={16} /> {tab === "automatic" ? "New automatic offer" : "New code"}
            </PillButton>
          </div>
          {discounts.length ? (
            <ListCard>
              {discounts.map((discount) => {
                const state = liveState(discount);
                return (
                  <ListRow key={discount.id}>
                    <div className="min-w-0 flex-1 basis-[200px]">
                      <div className="truncate text-[15px] font-extrabold">{discount.name}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">
                        {discount.config.automatic ? "Automatic" : <span className="font-mono">{discount.code}</span>}
                        {discount.config.productIds.length ? ` · ${discount.config.productIds.length} products` : ""}
                        {discount.config.segmentId ? ` · ${segments.find((s) => s.id === discount.config.segmentId)?.name ?? "a segment"}` : ""}
                        {discount.config.oncePerCustomer ? " · once each" : ""}
                      </div>
                    </div>
                    <div className="text-[13px] sm:w-[200px]">
                      <div className="font-extrabold">{describeDiscount(discount, naira)}</div>
                      <div className="text-app-ink-soft">{discount.minOrder ? `Orders over ${naira(discount.minOrder)}` : "Any order"} · {discount.usedCount}{discount.maxUses ? ` of ${discount.maxUses}` : ""} used</div>
                    </div>
                    <div className="text-[13px] text-app-ink-soft sm:w-[170px]">
                      <div><strong className="text-app-ink">{discount.orders}</strong> paid orders · {naira(discount.revenue)}</div>
                      <div>{discount.startsAt && new Date(discount.startsAt) > new Date() ? `Starts ${formatDate(discount.startsAt)}` : discount.expiresAt ? `Ends ${formatDate(discount.expiresAt)}` : "No end date"}</div>
                    </div>
                    <Pill tone={state.tone}>{state.label}</Pill>
                    <Toggle on={discount.status === "active"} onChange={(on) => void toggle(discount, on)} label={`${discount.name} live`} />
                    <div className="flex gap-2">
                      <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditor({ editing: discount })}>Edit</button>
                      <button type="button" className={buttonClass("danger", "sm")} aria-label={`Delete ${discount.name}`} onClick={() => void remove(discount)}><Icon name="trash" size={14} /></button>
                    </div>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <EmptyState icon="percent" title={tab === "automatic" ? "No automatic offers yet" : "No codes yet"} action={<PillButton size="md" onClick={() => setEditor({ editing: null })}>{tab === "automatic" ? "New automatic offer" : "New code"}</PillButton>}>
              {tab === "automatic" ? "A sale that applies on its own: 10% off this weekend, free delivery over ₦30,000, or buy 2 get 1 free." : "A code like WEEKEND20 that shoppers type at checkout. Share it on WhatsApp or Instagram."}
            </EmptyState>
          )}
        </>
      ) : (
        <>
          <NewCoupons
            onCreated={(codes) => {
              setNotice({ tone: "success", text: `New code${codes.length === 1 ? "" : "s"}: ${codes.join(", ")}` });
              router.refresh();
            }}
          />
          {coupons.length ? (
            <ListCard>
              {coupons.map((coupon) => {
                const state = coupon.status === "active" && coupon.maxUses && coupon.usedCount >= coupon.maxUses ? { tone: "muted" as Tone, label: "Used" } : liveState({ ...coupon, startsAt: null });
                return (
                  <ListRow key={coupon.id}>
                    <div className="min-w-0 flex-1 basis-full truncate font-mono text-[15px] font-bold sm:basis-auto">{coupon.code}</div>
                    <div className="text-[13px] sm:w-[200px]">
                      <div className="font-extrabold">{describeDiscount(coupon, naira)}</div>
                      <div className="text-app-ink-soft">{coupon.usedCount} of {coupon.maxUses || "unlimited"} used{coupon.revenue ? ` · ${naira(coupon.revenue)} sales` : ""}</div>
                    </div>
                    <div className="text-[13px] text-app-ink-soft sm:w-[120px]">{coupon.expiresAt ? `Ends ${formatDate(coupon.expiresAt)}` : "No end date"}</div>
                    <Pill tone={state.tone}>{state.label}</Pill>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(coupon.code).then(() => setNotice({ tone: "success", text: `${coupon.code} copied.` }), () => undefined)} className={buttonClass("white", "sm")}>Copy</button>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <EmptyState icon="tag" title="No one-use codes yet">Codes made by pop-up rewards and automations (welcome, win-back, birthday) show up here too.</EmptyState>
          )}
        </>
      )}

      {editor ? (
        <DiscountEditor
          editing={editor.editing}
          automatic={tab === "automatic"}
          segments={segments}
          products={products}
          onClose={() => setEditor(null)}
          onSaved={(text) => {
            setEditor(null);
            setNotice({ tone: "success", text });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
