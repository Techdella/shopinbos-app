"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput, Toggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { naira } from "@shared/onboarding";
import { DEFAULT_COMMISSION_RATE } from "@shared/affiliates";
import { useT } from "@/components/i18n/I18nProvider";

interface Affiliate {
  id: string;
  name: string;
  phone: string | null;
  code: string;
  link: string;
  commissionRate: number;
  active: boolean;
  totals: { pending: number; owed: number; paid: number; sales: number; deliveredOrders: number; orders: number };
  recentOrders: Array<{ id: string; orderNumber: string; buyerName: string; status: string; commission: number; paid: boolean }>;
}

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json?.data;
}

function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

function AddCreator({ onAdded }: { onAdded: () => void }) {
  const t = useT("affiliates");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_COMMISSION_RATE));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send("/api/app/affiliates", "POST", { name, phone: phone || null, commissionRate: Number(rate) || DEFAULT_COMMISSION_RATE });
      setName("");
      setPhone("");
      onAdded();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t("err.add"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[22px] border border-app-line bg-white p-5">
      <h2 className="m-0 text-[17px] font-extrabold">{t("add.title")}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_auto] sm:items-end">
        <div>
          <FieldLabel htmlFor="aff-name">{t("add.name")}</FieldLabel>
          <TextInput id="aff-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder={t("add.namePlaceholder")} />
        </div>
        <div>
          <FieldLabel htmlFor="aff-phone">{t("add.whatsapp")}</FieldLabel>
          <TextInput id="aff-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="aff-rate">{t("add.rate")}</FieldLabel>
          <TextInput id="aff-rate" inputMode="numeric" value={rate} onChange={(event) => setRate(event.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <PillButton type="submit" busy={busy}>{t("add.create")}</PillButton>
      </div>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
    </form>
  );
}

function CreatorCard({ affiliate, storeName, payday, onChange }: { affiliate: Affiliate; storeName: string; payday: string; onChange: () => void }) {
  const t = useT("affiliates", "common");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(key: string, body: unknown, method = "PATCH") {
    setBusy(key);
    setError(null);
    try {
      await send(`/api/app/affiliates/${affiliate.id}`, method, body);
      onChange();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : t("err.update"));
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(affiliate.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(t("err.copy"));
    }
  }

  const invite = t("invite", { name: affiliate.name.split(" ")[0], store: storeName, link: affiliate.link, rate: String(affiliate.commissionRate) });
  const { totals } = affiliate;

  return (
    <article className={cx("rounded-[22px] border border-app-line bg-white p-5", !affiliate.active && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[17px] font-extrabold">{affiliate.name}</h3>
          <div className="text-[13px] text-app-ink-soft">{t("rateCode", { rate: String(affiliate.commissionRate), code: affiliate.code })}</div>
        </div>
        <div className="flex items-center gap-2 text-[13px] font-bold">
          {affiliate.active ? t("linkOn") : t("linkOff")}
          <Toggle on={affiliate.active} onChange={(on) => void act("active", { active: on })} label={affiliate.active ? t("linkIsOn", { name: affiliate.name }) : t("linkIsOff", { name: affiliate.name })} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-app-canvas p-2 pl-3">
        <code className="min-w-0 flex-1 truncate text-[13px]">{affiliate.link}</code>
        <button type="button" onClick={() => void copy()} className="rounded-full border border-app-line bg-white px-3.5 py-1.5 text-[13px] font-extrabold">{copied ? t("copied") : t("copy")}</button>
        <a
          href={affiliate.phone ? `https://wa.me/${waNumber(affiliate.phone)}?text=${encodeURIComponent(invite)}` : `https://wa.me/?text=${encodeURIComponent(invite)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-app-success px-3.5 py-1.5 text-[13px] font-extrabold text-white no-underline"
        >
          {t("sendWhatsApp")}
        </a>
      </div>

      <dl className="m-0 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("stat.orders"), String(totals.orders)],
          [t("stat.sales"), naira(totals.sales)],
          [t("stat.pending"), naira(totals.pending)],
          [t("stat.paid"), naira(totals.paid)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[14px] bg-app-canvas px-3 py-2">
            <dt className="text-[12px] text-app-ink-soft">{label}</dt>
            <dd className="m-0 text-[16px] font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>

      {totals.owed > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-app-peach px-4 py-3">
          <div>
            <div className="text-[15px] font-extrabold">{t("youOwe", { amount: naira(totals.owed) })}</div>
            <div className="text-[12.5px] text-app-ink-soft">{t("payBy", { name: affiliate.name.split(" ")[0], date: payday })}</div>
          </div>
          <PillButton size="sm" busy={busy === "paid"} onClick={() => void act("paid", { markPaid: true })}>{t("markPaid")}</PillButton>
        </div>
      )}

      {affiliate.recentOrders.length > 0 && (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0 text-[13px]">
          {affiliate.recentOrders.map((order) => (
            <li key={order.id} className="flex justify-between gap-3 py-2">
              <a href={`/home/orders/${order.id}`} className="min-w-0 truncate font-bold text-app-ink no-underline">{order.buyerName} · {order.orderNumber}</a>
              <span className="shrink-0 text-app-ink-soft">
                {naira(order.commission)} · {order.paid ? t("order.paid") : order.status === "delivered" ? t("order.owed") : ["cancelled", "refunded", "returned"].includes(order.status) ? t("order.none") : t("order.after")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="text-[13px] font-bold text-app-danger"
          onClick={async () => {
            if ((await confirmDialog(t("confirmRemove", { name: affiliate.name })))) void act("delete", undefined, "DELETE");
          }}
        >
          {t("removeCreator")}
        </button>
      </div>
      {error && <div className="mt-2"><Notice>{error}</Notice></div>}
    </article>
  );
}

export function AffiliatesManager({ affiliates, storeName, payday }: { affiliates: Affiliate[]; storeName: string; payday: string }) {
  const router = useRouter();
  const t = useT("affiliates");
  const refresh = () => router.refresh();
  const owed = affiliates.reduce((sum, affiliate) => sum + affiliate.totals.owed, 0);

  return (
    <div className="grid gap-4">
      <AddCreator onAdded={refresh} />
      {owed > 0 && <Notice tone="info">{t("owedTotal", { amount: naira(owed), date: payday })}</Notice>}
      {affiliates.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {affiliates.map((affiliate) => <CreatorCard key={affiliate.id} affiliate={affiliate} storeName={storeName} payday={payday} onChange={refresh} />)}
        </div>
      ) : (
        <section className="rounded-[22px] border border-dashed border-app-line-strong bg-white px-6 py-10 text-center">
          <div className="text-[34px] font-extrabold tracking-[-1px]">10%</div>
          <p className="mx-auto mb-0 mt-1 max-w-[440px] text-[14.5px] leading-[1.55] text-app-ink-soft">
            {t("emptyBody")}
          </p>
        </section>
      )}
    </div>
  );
}
