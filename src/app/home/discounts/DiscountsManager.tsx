"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, type Tone } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Field, buttonClass, formatDate, inputClass, selectClass } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";

interface Offer {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  status: string;
}

interface Discount extends Offer {
  name: string;
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "success", label: "Live" },
  scheduled: { tone: "info", label: "Scheduled" },
  draft: { tone: "muted", label: "Draft" },
  disabled: { tone: "muted", label: "Off" },
  expired: { tone: "warning", label: "Ended" },
  used: { tone: "muted", label: "Used" },
};

function describe(offer: { type: string; value: number }) {
  switch (offer.type) {
    case "percentage": return `${offer.value}% off`;
    case "fixed_amount": return `${naira(offer.value)} off`;
    case "free_shipping": return "Free delivery";
    case "bogo": return `${offer.value}% off the second item`;
    default: return String(offer.value);
  }
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? (typeof json?.error === "string" ? json.error : "Something went wrong. Try again."));
  return json.data;
}

const EMPTY = { name: "", code: "", type: "percentage", value: "", minOrder: "", maxUses: "", expiresAt: "", status: "active" };

function NewDiscount({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await send("/api/store/discounts", "POST", {
        name: form.name,
        code: form.code,
        type: form.type,
        value: form.type === "free_shipping" ? Number(form.value) || 1 : Number(form.value),
        minOrder: form.minOrder ? Number(form.minOrder) : undefined,
        maxUses: form.maxUses ? Math.floor(Number(form.maxUses)) : undefined,
        expiresAt: form.expiresAt || undefined,
        status: form.status,
      });
      onCreated(created.code);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Couldn't create the discount.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHead title="New discount" action={<button type="button" onClick={onClose} className="min-h-[40px] text-[14px] font-bold text-app-ink-soft hover:text-app-ink">Close</button>} />
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Name" htmlFor="d-name"><input id="d-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required maxLength={120} placeholder="Weekend sale" /></Field>
          <Field label="Code shoppers type" htmlFor="d-code"><input id="d-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })} className={`${inputClass} font-mono`} required maxLength={40} placeholder="WEEKEND20" /></Field>
          <Field label="Kind" htmlFor="d-type">
            <select id="d-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={selectClass}>
              <option value="percentage">Percentage off</option>
              <option value="fixed_amount">Amount off (₦)</option>
              <option value="free_shipping">Free delivery</option>
            </select>
          </Field>
          {form.type !== "free_shipping" && (
            <Field label={form.type === "percentage" ? "Percent off" : "Naira off"} htmlFor="d-value">
              <input id="d-value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} type="number" min="0.01" step="0.01" className={inputClass} required />
            </Field>
          )}
          <Field label="Smallest order (₦, optional)" htmlFor="d-min"><input id="d-min" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} type="number" min="0" className={inputClass} /></Field>
          <Field label="Most uses (optional)" htmlFor="d-max"><input id="d-max" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} type="number" min="0" className={inputClass} /></Field>
          <Field label="Ends (optional)" htmlFor="d-ends"><input id="d-ends" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} type="date" className={inputClass} /></Field>
          <Field label="Status" htmlFor="d-status">
            <select id="d-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={selectClass}>
              <option value="active">Live now</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <PillButton size="md" type="submit" busy={saving}>Create discount</PillButton>
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
        </div>
      </form>
    </Card>
  );
}

function NewCoupon({ onCreated }: { onCreated: (code: string) => void }) {
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await send("/api/store/coupons", "POST", { action: "generate", type, value: Number(value) });
      onCreated(created.code);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Couldn't make a code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHead title="Make a one-time coupon code" sub="We make a random code that works once." />
      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Kind" htmlFor="c-type">
          <select id="c-type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Amount off (₦)</option>
          </select>
        </Field>
        <Field label={type === "percentage" ? "Percent off" : "Naira off"} htmlFor="c-value">
          <input id="c-value" value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0.01" step="0.01" className={inputClass} required />
        </Field>
        <PillButton size="md" type="submit" busy={busy}><Icon name="plus" size={16} /> Make code</PillButton>
      </form>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
    </Card>
  );
}

export function DiscountsManager({ tab, startOpen, discounts, coupons }: { tab: string; startOpen: boolean; discounts: Discount[]; coupons: Offer[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(startOpen);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(discount: Discount, on: boolean) {
    setBusy(discount.id);
    setNotice(null);
    try {
      await send("/api/store/discounts", "PATCH", { id: discount.id, status: on ? "active" : "disabled" });
      router.refresh();
    } catch (toggleError) {
      setNotice({ tone: "error", text: toggleError instanceof Error ? toggleError.message : "Couldn't update that discount." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {tab === "Discounts" && (
        <>
          {showForm ? (
            <NewDiscount
              onClose={() => setShowForm(false)}
              onCreated={(code) => {
                setShowForm(false);
                setNotice({ tone: "success", text: `${code} is ready.` });
                router.refresh();
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <PillButton size="md" tone="accent" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> New discount</PillButton>
            </div>
          )}
          {discounts.length ? (
            <ListCard>
              {discounts.map((discount) => {
                const status = STATUS[discount.status] ?? { tone: "muted" as Tone, label: discount.status };
                return (
                  <ListRow key={discount.id}>
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <div className="truncate text-[15px] font-extrabold">{discount.name}</div>
                      <div className="truncate font-mono text-[13px] text-app-ink-soft">{discount.code}</div>
                    </div>
                    <div className="text-[13px] sm:w-[200px]">
                      <div className="font-extrabold">{describe(discount)}</div>
                      <div className="text-app-ink-soft">
                        {discount.minOrder ? `Orders over ${naira(discount.minOrder)} · ` : ""}{discount.usedCount}{discount.maxUses ? ` of ${discount.maxUses}` : ""} used
                      </div>
                    </div>
                    <div className="text-[13px] text-app-ink-soft sm:w-[120px]">{discount.expiresAt ? `Ends ${formatDate(discount.expiresAt)}` : "No end date"}</div>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    <Toggle
                      on={discount.status === "active"}
                      onChange={(on) => { if (busy !== discount.id) void toggle(discount, on); }}
                      label={`${discount.code} is ${discount.status === "active" ? "live" : "off"}`}
                    />
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            !showForm && (
              <EmptyState icon="percent" title="No discounts yet" action={<PillButton size="md" onClick={() => setShowForm(true)}>New discount</PillButton>}>
                Make a code like WEEKEND20 that takes money off at checkout.
              </EmptyState>
            )
          )}
        </>
      )}

      {tab === "Coupon Codes" && (
        <>
          <NewCoupon
            onCreated={(code) => {
              setNotice({ tone: "success", text: `New code: ${code}` });
              router.refresh();
            }}
          />
          {coupons.length ? (
            <ListCard>
              {coupons.map((coupon) => {
                const status = STATUS[coupon.status] ?? { tone: "muted" as Tone, label: coupon.status };
                return (
                  <ListRow key={coupon.id}>
                    <div className="min-w-0 flex-1 basis-full truncate font-mono text-[15px] font-bold sm:basis-auto">{coupon.code}</div>
                    <div className="text-[13px] sm:w-[200px]">
                      <div className="font-extrabold">{describe(coupon)}</div>
                      <div className="text-app-ink-soft">{coupon.minOrder ? `Orders over ${naira(coupon.minOrder)} · ` : ""}{coupon.usedCount} of {coupon.maxUses || "unlimited"} used</div>
                    </div>
                    <div className="text-[13px] text-app-ink-soft sm:w-[120px]">{coupon.expiresAt ? `Ends ${formatDate(coupon.expiresAt)}` : "No end date"}</div>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(coupon.code).then(() => setNotice({ tone: "success", text: `${coupon.code} copied.` }), () => undefined)}
                      className={buttonClass("white", "sm")}
                    >
                      Copy
                    </button>
                  </ListRow>
                );
              })}
            </ListCard>
          ) : (
            <EmptyState icon="tag" title="No coupon codes yet">One-time codes are good for thank-you notes and making things right with a customer.</EmptyState>
          )}
        </>
      )}

      {tab === "Sales Events" && (
        <EmptyState icon="calendar" title="Sales events are coming">
          You can&apos;t schedule a store-wide sale yet. For now, make a discount with an end date and share the code.
        </EmptyState>
      )}
    </div>
  );
}
