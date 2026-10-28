"use client";

import { useState } from "react";
import { BRANDING_FEE_MAX, type BrandingOffer } from "@shared/dropship-rules";
import { friendlyError } from "@/lib/errors/report-client";
import { fieldClass } from "./supplier-kit";

// "Branding you offer" (/supplier/branding): what the supplier can do for shops that dropship from them. Blind
// packing and the seller's name on tracking are always on; the seller's packing slip and stickers unlock at Trusted;
// custom packaging is quoted in chat. Saved through PUT /api/supplier/branding.

export interface BrandingInitial {
  offer: BrandingOffer;
  level: string;
  allowed: boolean;
}

function AlwaysOn({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-app-line bg-app-canvas px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold">{title}</span>
        <span className="block text-[12.5px] text-app-ink-soft">{sub}</span>
      </span>
      <span className="shrink-0 rounded-full bg-app-success-tint px-2.5 py-1 text-[11px] font-extrabold tracking-[0.08em] text-app-success">ALWAYS ON</span>
    </div>
  );
}

export function BrandingOfferForm({ initial }: { initial: BrandingInitial }) {
  const [offer, setOffer] = useState<BrandingOffer>(initial.offer);
  const [slipFee, setSlipFee] = useState(initial.offer.packingSlipFee ? String(initial.offer.packingSlipFee) : "");
  const [stickerFee, setStickerFee] = useState(initial.offer.stickerFee ? String(initial.offer.stickerFee) : "");
  const [allowed, setAllowed] = useState(initial.allowed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/supplier/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...offer, packingSlipFee: Number(slipFee) || 0, stickerFee: Number(stickerFee) || 0 }),
      });
      const json = (await response.json().catch(() => null)) as { data?: BrandingInitial; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't save. Try again.");
      setOffer(json.data.offer);
      setAllowed(json.data.allowed);
      setSlipFee(json.data.offer.packingSlipFee ? String(json.data.offer.packingSlipFee) : "");
      setStickerFee(json.data.offer.stickerFee ? String(json.data.offer.stickerFee) : "");
      setMessage({ tone: "ok", text: "Saved. Sellers see what you offer when they add your products." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? friendlyError(error) : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const extra = (key: "packingSlip" | "stickers", title: string, sub: string, fee: string, setFee: (value: string) => void, feeLabel: string) => {
    const locked = !allowed;
    return (
      <div className={`grid gap-3 rounded-[16px] border px-4 py-3 ${offer[key] && !locked ? "border-app-ink" : "border-app-line"} ${locked ? "opacity-70" : ""}`}>
        <label className={`flex items-start gap-3 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <input type="checkbox" checked={offer[key] && !locked} disabled={locked} onChange={(event) => setOffer({ ...offer, [key]: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold">{title}</span>
            <span className="block text-[12.5px] text-app-ink-soft">{sub}</span>
          </span>
          {locked && <span className="shrink-0 rounded-full bg-app-canvas px-2.5 py-1 text-[11px] font-extrabold tracking-[0.08em] text-app-ink-soft">UNLOCKS AT TRUSTED</span>}
        </label>
        {offer[key] && !locked && (
          <div className="max-w-[260px] pl-8">
            <label htmlFor={`fee-${key}`} className="mb-1 block text-[13px] font-bold">{feeLabel}</label>
            <input id={`fee-${key}`} className={fieldClass} type="number" min="0" max={BRANDING_FEE_MAX} step="1" inputMode="numeric" placeholder="0 = free" value={fee} onChange={(event) => setFee(event.target.value)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-3">
      <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">Customers should feel the parcel came from the seller&apos;s shop. The first two are always on.</p>
      <AlwaysOn title="Blind packing" sub="No price tag, receipt or your name inside the parcel" />
      <AlwaysOn title="Seller's name on tracking" sub="Texts and WhatsApp updates come from the seller's shop" />
      {extra("packingSlip", "Print the seller's packing slip", "Their logo, thank-you note and SKU. Needs a printer.", slipFee, setSlipFee, "Your fee per parcel (₦, optional)")}
      {extra("stickers", "Use the seller's stickers or bags", "They send you a pack once. You use one per order and we count it down.", stickerFee, setStickerFee, "Your fee per parcel (₦)")}
      <label className={`flex cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3 ${offer.custom ? "border-app-ink" : "border-app-line"}`}>
        <input type="checkbox" checked={offer.custom} onChange={(event) => setOffer({ ...offer, custom: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
        <span className="min-w-0">
          <span className="block text-[14.5px] font-bold">Custom packaging</span>
          <span className="block text-[12.5px] text-app-ink-soft">Boxes, cards, gift wrap. You quote in chat, per order.</span>
        </span>
      </label>
      {!allowed && (
        <p className="m-0 text-[13px] text-app-ink-soft">
          Packing slips and stickers open at Trusted: 25 delivered orders and a 4.3 rating. <a href="/supplier/level" className="font-bold text-app-ink underline underline-offset-4">See your level</a>
        </p>
      )}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`m-0 rounded-[14px] px-4 py-3 text-[14px] font-bold ${message.tone === "error" ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {message.text}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
