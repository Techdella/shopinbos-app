"use client";

import { confirmDialog } from "@/components/ui/dialogs";
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
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";

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

const STATUS: Record<string, { tone: Tone; label: MessageKey<"discounts"> }> = {
  active: { tone: "success", label: "status.active" },
  scheduled: { tone: "info", label: "status.scheduled" },
  draft: { tone: "muted", label: "status.draft" },
  disabled: { tone: "muted", label: "status.disabled" },
  expired: { tone: "warning", label: "status.expired" },
  used: { tone: "muted", label: "status.used" },
};

/** What a discount is doing right now, from its status and dates. */
function liveState(d: { status: string; startsAt: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number }) {
  const now = Date.now();
  if (d.status !== "active") return STATUS[d.status] ?? STATUS.draft;
  if (d.expiresAt && new Date(d.expiresAt).getTime() < now) return STATUS.expired;
  if (d.maxUses && d.usedCount >= d.maxUses) return { tone: "warning" as Tone, label: "status.usedUp" as MessageKey<"discounts"> };
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
  const t = useT("discounts", "common");
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
      onSaved(editing ? t("saved") : d.automatic ? t("isSetUp", { name: d.name }) : t("isReady", { code: saved.code }));
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? t("editName", { name: editing.name }) : d.automatic ? t("newAutomatic") : t("newCodeTitle")} onClose={onClose} wide>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} htmlFor="d-name"><input id="d-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputClass} required maxLength={120} placeholder={d.automatic ? t("namePlaceholderAuto") : t("namePlaceholderCode")} /></Field>
          {d.automatic ? (
            <p className="m-0 self-end text-[13.5px] text-app-ink-soft">{t("appliesNoCode")}</p>
          ) : (
            <Field label={t("codeShoppersType")} htmlFor="d-code"><input id="d-code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} className={`${inputClass} font-mono`} required maxLength={40} placeholder="WEEKEND20" /></Field>
          )}
          <Field label={t("kind")} htmlFor="d-type">
            <select id="d-type" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as Draft["type"] })} className={selectClass}>
              <option value="percentage">{t("percentageOff")}</option>
              <option value="fixed_amount">{t("amountOff")}</option>
              <option value="free_shipping">{t("freeDelivery")}</option>
              <option value="bogo">{t("buyXgetY")}</option>
            </select>
          </Field>
          {d.type === "percentage" || d.type === "fixed_amount" ? (
            <Field label={d.type === "percentage" ? t("percentOff") : t("nairaOff")} htmlFor="d-value"><input id="d-value" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} type="number" min="1" max={d.type === "percentage" ? 100 : undefined} className={inputClass} required /></Field>
          ) : null}
        </div>
        {d.type === "bogo" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-app-canvas p-3 text-[14px]">
            <span>{t("buy")}</span>
            <input aria-label={t("buyQty")} type="number" min={1} value={d.buyQuantity} onChange={(e) => setD({ ...d, buyQuantity: e.target.value })} className={`${inputClass} w-[80px]`} />
            <span>{t("get")}</span>
            <input aria-label={t("getQty")} type="number" min={1} value={d.getQuantity} onChange={(e) => setD({ ...d, getQuantity: e.target.value })} className={`${inputClass} w-[80px]`} />
            <input aria-label={t("percentExtra")} type="number" min={1} max={100} value={d.getPercent} onChange={(e) => setD({ ...d, getPercent: e.target.value })} className={`${inputClass} w-[90px]`} />
            <span>{t("bogoNote")}</span>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("appliesTo")} htmlFor="d-scope">
            <select id="d-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={selectClass}>
              <option value="all">{t("everything")}</option>
              <option value="some">{t("someProducts")}</option>
            </select>
          </Field>
          <Field label={t("whoCan")} htmlFor="d-segment" hint={d.segmentId ? t("whoCanHint") : undefined}>
            <select id="d-segment" value={d.segmentId} onChange={(e) => setD({ ...d, segmentId: e.target.value })} className={selectClass}>
              <option value="">{t("everyone")}</option>
              {segments.map((s) => <option key={s.id} value={s.id}>{t("segmentName", { name: s.name })}</option>)}
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
            )) : <p className="m-0 text-[13px] text-app-ink-soft">{t("noProducts")}</p>}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={t("smallestOrder")} htmlFor="d-min"><input id="d-min" value={d.minOrder} onChange={(e) => setD({ ...d, minOrder: e.target.value })} type="number" min="0" className={inputClass} placeholder={t("none")} /></Field>
          <Field label={t("totalUses")} htmlFor="d-max"><input id="d-max" value={d.maxUses} onChange={(e) => setD({ ...d, maxUses: e.target.value })} type="number" min="0" className={inputClass} placeholder={t("noLimit")} /></Field>
          <Field label={t("starts")} htmlFor="d-start"><input id="d-start" value={d.startsAt} onChange={(e) => setD({ ...d, startsAt: e.target.value })} type="datetime-local" className={inputClass} /></Field>
          <Field label={t("ends")} htmlFor="d-end"><input id="d-end" value={d.expiresAt} onChange={(e) => setD({ ...d, expiresAt: e.target.value })} type="datetime-local" className={inputClass} /></Field>
        </div>
        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={d.oncePerCustomer} onChange={(e) => setD({ ...d, oncePerCustomer: e.target.checked })} /> {t("oncePerCustomer")}</label>
        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] font-bold"><input type="checkbox" className={checkClass} checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> {t("liveFromStart")}</label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
          <PillButton size="md" type="submit" busy={saving}>{editing ? t("save") : t("create")}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

function NewCoupons({ onCreated }: { onCreated: (codes: string[]) => void }) {
  const t = useT("discounts");
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
      setError(errorText(createError, t("coupons.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHead title={t("coupons.title")} sub={t("coupons.sub")} />
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,120px)_auto] sm:items-end">
        <Field label={t("kind")} htmlFor="c-type">
          <select id="c-type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="percentage">{t("percentageOff")}</option>
            <option value="fixed_amount">{t("amountOff")}</option>
          </select>
        </Field>
        <Field label={type === "percentage" ? t("percentOff") : t("nairaOff")} htmlFor="c-value"><input id="c-value" value={value} onChange={(e) => setValue(e.target.value)} type="number" min="1" className={inputClass} required /></Field>
        <Field label={t("coupons.howMany")} htmlFor="c-count"><input id="c-count" value={count} onChange={(e) => setCount(e.target.value)} type="number" min="1" max="50" className={inputClass} /></Field>
        <PillButton size="md" type="submit" busy={busy}><Icon name="plus" size={16} /> {t("coupons.make")}</PillButton>
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
  const t = useT("discounts", "common");
  const locale = useLocale();
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
    if (!(await confirmDialog(t("confirmDelete", { name: discount.name })))) return;
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
              <Icon name="plus" size={16} /> {tab === "automatic" ? t("newAutomatic") : t("newCode")}
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
                        {discount.config.automatic ? t("tab.automatic") : <span className="font-mono">{discount.code}</span>}
                        {discount.config.productIds.length ? ` · ${t("row.products", { count: discount.config.productIds.length })}` : ""}
                        {discount.config.segmentId ? ` · ${segments.find((s) => s.id === discount.config.segmentId)?.name ?? t("row.aSegment")}` : ""}
                        {discount.config.oncePerCustomer ? ` · ${t("row.onceEach")}` : ""}
                      </div>
                    </div>
                    <div className="text-[13px] sm:w-[200px]">
                      <div className="font-extrabold">{describeDiscount(discount, naira)}</div>
                      <div className="text-app-ink-soft">{discount.minOrder ? t("row.ordersOver", { amount: naira(discount.minOrder) }) : t("row.anyOrder")} · {discount.maxUses ? t("row.usedOf", { used: discount.usedCount, max: discount.maxUses }) : t("row.used", { used: discount.usedCount })}</div>
                    </div>
                    <div className="text-[13px] text-app-ink-soft sm:w-[170px]">
                      <div><strong className="text-app-ink">{discount.orders}</strong> {t("row.paidOrders")} · {naira(discount.revenue)}</div>
                      <div>{discount.startsAt && new Date(discount.startsAt) > new Date() ? t("row.starts", { date: formatDate(discount.startsAt, false, locale) }) : discount.expiresAt ? t("row.ends", { date: formatDate(discount.expiresAt, false, locale) }) : t("row.noEnd")}</div>
                    </div>
                    <Pill tone={state.tone}>{t(state.label)}</Pill>
                    <Toggle on={discount.status === "active"} onChange={(on) => void toggle(discount, on)} label={t("row.liveLabel", { name: discount.name })} />
                    <div className="flex gap-2">
                      <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditor({ editing: discount })}>{t("edit")}</button>
                      <button type="button" className={buttonClass("danger", "sm")} aria-label={t("row.delete", { name: discount.name })} onClick={() => void remove(discount)}><Icon name="trash" size={14} /></button>
                    </div>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <EmptyState icon="percent" title={tab === "automatic" ? t("empty.automatic") : t("empty.codes")} action={<PillButton size="md" onClick={() => setEditor({ editing: null })}>{tab === "automatic" ? t("newAutomatic") : t("newCode")}</PillButton>}>
              {tab === "automatic" ? t("empty.automaticBody") : t("empty.codesBody")}
            </EmptyState>
          )}
        </>
      ) : (
        <>
          <NewCoupons
            onCreated={(codes) => {
              setNotice({ tone: "success", text: t("coupons.newCodes", { count: codes.length, codes: codes.join(", ") }) });
              router.refresh();
            }}
          />
          {coupons.length ? (
            <ListCard>
              {coupons.map((coupon) => {
                const state = coupon.status === "active" && coupon.maxUses && coupon.usedCount >= coupon.maxUses ? { tone: "muted" as Tone, label: "status.used" as MessageKey<"discounts"> } : liveState({ ...coupon, startsAt: null });
                return (
                  <ListRow key={coupon.id}>
                    <div className="min-w-0 flex-1 basis-full truncate font-mono text-[15px] font-bold sm:basis-auto">{coupon.code}</div>
                    <div className="text-[13px] sm:w-[200px]">
                      <div className="font-extrabold">{describeDiscount(coupon, naira)}</div>
                      <div className="text-app-ink-soft">{t("row.usedOf", { used: coupon.usedCount, max: coupon.maxUses || t("row.unlimited") })}{coupon.revenue ? ` · ${t("row.sales", { amount: naira(coupon.revenue) })}` : ""}</div>
                    </div>
                    <div className="text-[13px] text-app-ink-soft sm:w-[120px]">{coupon.expiresAt ? t("row.ends", { date: formatDate(coupon.expiresAt, false, locale) }) : t("row.noEnd")}</div>
                    <Pill tone={state.tone}>{t(state.label)}</Pill>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(coupon.code).then(() => setNotice({ tone: "success", text: t("coupons.copied", { code: coupon.code }) }), () => undefined)} className={buttonClass("white", "sm")}>{t("copy")}</button>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <EmptyState icon="tag" title={t("empty.coupons")}>{t("empty.couponsBody")}</EmptyState>
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
