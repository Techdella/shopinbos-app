"use client";

import { useMemo, useRef, useState } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { PackRender } from "@/components/packaging/PackRender";
import { downloadPrintPdf } from "@/components/packaging/export";
import { PACK_FORMAT_INFO, type PackDesign } from "@shared/packaging";
import { DELIVERY_ZONES, PRINT_FINISHES, PRINT_MATERIALS, QUANTITY_TIERS, minQuantity, quotePrint, type DeliveryZone, type PrintFinish } from "@shared/print-orders";

const inputClass = "h-11 w-full rounded-[12px] border border-app-line bg-white px-3 text-[14px] outline-none focus:border-app-ink";
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** Order prints: how many, on what, which finish, where to deliver; the price updates as they choose. */
export function OrderPrints({ design: saved, contact }: { design: { id: string; title: string; design: PackDesign }; contact: { name: string; phone: string; city: string } }) {
  const t = useT("packaging", "common");
  const design = saved.design;
  const min = minQuantity(design.format);
  const tiers = QUANTITY_TIERS.filter((tier) => tier >= min);
  const [quantity, setQuantity] = useState<number>(Math.max(min, 500));
  const [custom, setCustom] = useState("");
  const [material, setMaterial] = useState(PRINT_MATERIALS[design.format][0].id);
  const [finish, setFinish] = useState<PrintFinish>(design.finish === "gloss" ? "gloss" : design.finish === "foil" ? "foil" : "matte");
  const [zone, setZone] = useState<DeliveryZone>("lagos");
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(contact.city);
  const [state, setState] = useState("");
  const [notes, setNotes] = useState("");
  const [proofOk, setProofOk] = useState(false);
  const [busy, setBusy] = useState<null | "pay" | "proof">(null);
  const [error, setError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const quote = useMemo(() => quotePrint({ format: design.format, size: design.size, quantity, material, finish, zone }), [design, quantity, material, finish, zone]);
  const pickup = zone === "pickup";

  async function proof() {
    if (!exportRef.current) return;
    setBusy("proof");
    try {
      await downloadPrintPdf(exportRef.current, design, saved.title);
    } catch {
      setError(t("err.download"));
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const response = await fetch("/api/app/print-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: saved.id, quantity: quote.quantity, material, finish, zone, contactName: name.trim(), contactPhone: phone.trim(), address: pickup ? null : address.trim() || null, city: pickup ? null : city.trim() || null, state: pickup ? null : state.trim() || null, notes: notes.trim() || null, proofOk }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { authorizationUrl: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) throw new Error(json?.error?.message ?? t("order.failed"));
      window.location.href = json.data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("order.failed"));
      setBusy(null);
    }
  }

  const chip = (on: boolean) => cx("min-h-[40px] rounded-full border px-4 text-[13.5px] font-bold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white");
  const sizeLabel = design.format === "round_sticker" ? `${design.size.w} mm` : `${design.size.w} × ${design.size.h}${design.size.d ? ` × ${design.size.d}` : ""} mm`;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-4">
        <section className="flex flex-wrap items-center gap-4 rounded-[20px] border border-app-line bg-white p-4">
          <div className="grid h-36 w-28 shrink-0 place-items-center rounded-[14px] bg-app-canvas p-2">
            <PackRender design={design} view="front" className="max-h-full max-w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.2)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[17px] font-extrabold">{saved.title}</p>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t.dynamic(`format.${design.format}`, PACK_FORMAT_INFO[design.format].name)} · {sizeLabel}</p>
            <PillButton size="sm" tone="white" busy={busy === "proof"} disabled={Boolean(busy)} onClick={() => void proof()} className="mt-2">
              <Icon name="download" size={14} /> {t("order.proof")}
            </PillButton>
          </div>
        </section>

        <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] font-extrabold">{t("order.howMany")}</p>
          <div className="flex flex-wrap gap-2">
            {tiers.map((tier) => (
              <button key={tier} type="button" aria-pressed={quantity === tier && !custom} onClick={() => { setQuantity(tier); setCustom(""); }} className={chip(quantity === tier && !custom)}>
                {tier.toLocaleString("en-NG")}
              </button>
            ))}
            <input value={custom} inputMode="numeric" placeholder={t("order.other")} aria-label={t("order.other")} onChange={(event) => { const value = event.target.value.replace(/\D/g, ""); setCustom(value); if (value) setQuantity(Number(value)); }} className="h-10 w-[110px] rounded-full border border-app-line px-4 text-[13.5px]" />
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("order.min", { count: min })}</p>
        </section>

        <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] font-extrabold">{t("order.material")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRINT_MATERIALS[design.format].map((item) => (
              <label key={item.id} className={cx("flex cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-[13.5px] font-bold", material === item.id ? "border-app-ink bg-app-canvas" : "border-app-line")}>
                <input type="radio" name="material" checked={material === item.id} onChange={() => setMaterial(item.id)} className="h-4 w-4" />
                {t.dynamic(`mat.${item.id}`, item.name)}
              </label>
            ))}
          </div>
          <p className="m-0 mt-1 text-[15px] font-extrabold">{t("order.finish")}</p>
          <div className="flex flex-wrap gap-2">
            {PRINT_FINISHES.map((item) => (
              <button key={item.id} type="button" aria-pressed={finish === item.id} onClick={() => setFinish(item.id)} className={chip(finish === item.id)}>
                {t.dynamic(`fin.${item.id}`, item.name)}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
          <p className="m-0 text-[15px] font-extrabold">{t("order.delivery")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DELIVERY_ZONES.map((item) => (
              <label key={item.id} className={cx("flex cursor-pointer items-center justify-between gap-2 rounded-[14px] border px-3 py-2.5 text-[13.5px] font-bold", zone === item.id ? "border-app-ink bg-app-canvas" : "border-app-line")}>
                <span className="flex items-center gap-2.5">
                  <input type="radio" name="zone" checked={zone === item.id} onChange={() => setZone(item.id)} className="h-4 w-4" />
                  {t.dynamic(`zone.${item.id}`, item.name)}
                </span>
                <span className="text-app-ink-soft">{item.fee ? naira(item.fee) : t("order.free")}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] font-bold">{t("req.name")}<input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
            <label className="grid gap-1 text-[13px] font-bold">{t("req.phone")}<input value={phone} type="tel" onChange={(event) => setPhone(event.target.value)} className={inputClass} /></label>
          </div>
          {!pickup ? (
            <>
              <label className="grid gap-1 text-[13px] font-bold">{t("order.address")}<input value={address} onChange={(event) => setAddress(event.target.value)} className={inputClass} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[13px] font-bold">{t("order.city")}<input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} /></label>
                <label className="grid gap-1 text-[13px] font-bold">{t("order.state")}<input value={state} onChange={(event) => setState(event.target.value)} className={inputClass} /></label>
              </div>
            </>
          ) : (
            <p className="m-0 text-[13px] text-app-ink-soft">{t("order.pickupNote")}</p>
          )}
          <label className="grid gap-1 text-[13px] font-bold">
            {t("order.notes")}
            <textarea value={notes} rows={2} onChange={(event) => setNotes(event.target.value)} placeholder={t("order.notesPlaceholder")} className="w-full rounded-[12px] border border-app-line px-3 py-2 text-[14px] outline-none focus:border-app-ink" />
          </label>
        </section>
      </div>

      <aside className="grid gap-3 lg:sticky lg:top-4">
        <section className="grid gap-2 rounded-[20px] border border-app-line bg-white p-5 text-[14px]">
          <p className="m-0 text-[16px] font-extrabold">{t("order.summary")}</p>
          <Row label={t("order.printLine", { count: quote.quantity, price: naira(quote.unitPrice) })} value={naira(quote.printCost)} />
          <Row label={t("order.setup")} value={naira(quote.setupFee)} />
          <Row label={pickup ? t("order.pickup") : t("order.deliveryFee")} value={quote.deliveryFee ? naira(quote.deliveryFee) : t("order.free")} />
          <div className="mt-1 flex items-center justify-between border-t border-app-line pt-3 text-[18px] font-extrabold">
            <span>{t("order.total")}</span>
            <span>{naira(quote.total)}</span>
          </div>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("order.days", { days: quote.days })}</p>
          <label className="mt-2 flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={proofOk} onChange={(event) => setProofOk(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("order.proofOk")}</span>
          </label>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <PillButton busy={busy === "pay"} disabled={Boolean(busy) || !proofOk} onClick={() => void pay()} className="mt-1 w-full">
            {t("order.pay", { total: naira(quote.total) })}
          </PillButton>
          <p className="m-0 text-center text-[12px] text-app-ink-soft">{t("order.paystack")}</p>
        </section>
        <p className="m-0 rounded-[16px] bg-app-canvas p-3 text-[12.5px] text-app-ink-soft">{t("order.estimate")}</p>
      </aside>

      <div aria-hidden className="pointer-events-none fixed left-[-200000px] top-0">
        <div ref={exportRef} className="inline-block">
          <PackRender design={design} view="flat" pixelSize />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-app-ink-soft">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
