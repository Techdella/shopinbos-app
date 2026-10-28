"use client";

import { useState } from "react";
import { BRANDING_FEE_MAX, type BrandingOffer } from "@shared/dropship-rules";
import { friendlyError } from "@/lib/errors/report-client";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass } from "./supplier-kit";
import { CapsPill, IconTile, RowText, SwitchRow } from "./dropship-ui";

// "Branding you offer" (/supplier/branding): what the supplier can do for shops that dropship from them. Blind
// packing and the seller's name on tracking are always on; the seller's packing slip and stickers unlock at Trusted;
// custom packaging is quoted in chat. Saved through PUT /api/supplier/branding.

export interface BrandingInitial {
  offer: BrandingOffer;
  level: string;
  allowed: boolean;
}

/** A white row (`.it` on P-Branding): icon tile, title and grey line, then a pill or a switch. */
const ROW = "rounded-[18px] bg-white px-4 py-3";

function AlwaysOn({ icon, tint, title, sub }: { icon: IconName; tint: string; title: string; sub: string }) {
  return (
    <div className={cx(ROW, "flex min-h-[64px] items-center gap-3")}>
      <IconTile className={tint}><Icon name={icon} size={18} /></IconTile>
      <span className="min-w-0 flex-1"><RowText title={title} sub={sub} /></span>
      <CapsPill>Always on</CapsPill>
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

  const extra = (key: "packingSlip" | "stickers", icon: IconName, tint: string, title: string, sub: string, fee: string, setFee: (value: string) => void, feeLabel: string) => {
    const locked = !allowed;
    const on = offer[key] && !locked;
    return (
      <div className={cx(ROW, "grid gap-2", locked && "opacity-80")}>
        <SwitchRow
          checked={on}
          disabled={locked}
          onChange={(event) => setOffer({ ...offer, [key]: event.target.checked })}
          icon={<IconTile className={tint}><Icon name={icon} size={18} /></IconTile>}
          aside={locked ? <CapsPill tone="muted">UNLOCKS AT TRUSTED</CapsPill> : undefined}
        >
          <RowText title={title} sub={sub} />
        </SwitchRow>
        {on && (
          <div className="ml-[52px] flex flex-wrap items-center gap-2 text-[13px] font-bold text-app-gray-ink">
            <label htmlFor={`fee-${key}`}>{feeLabel}</label>
            <span className="inline-flex h-[34px] items-center gap-0.5 rounded-[10px] border-2 border-app-ink px-2.5 focus-within:ring-2 focus-within:ring-app-accent focus-within:ring-offset-1">
              <span aria-hidden className="font-app-display text-[15px] font-extrabold text-app-ink">₦</span>
              <input id={`fee-${key}`} className="w-[6ch] bg-transparent font-app-display text-[15px] font-extrabold text-app-ink outline-none placeholder:font-app placeholder:text-[12px] placeholder:font-bold placeholder:text-app-ink-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" min="0" max={BRANDING_FEE_MAX} step="1" inputMode="numeric" placeholder="0 = free" value={fee} onChange={(event) => setFee(event.target.value)} />
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-2">
      <p className="m-0 mb-1 text-[14px] leading-[1.45] text-app-gray-ink">Customers should feel the parcel came from the seller&apos;s shop. The first two are always on.</p>
      <AlwaysOn icon="package" tint="bg-app-line" title="Blind packing" sub="No price tag, receipt or your name inside the parcel" />
      <AlwaysOn icon="chat" tint="bg-app-success-tint" title="Seller's name on tracking" sub="Texts and WhatsApp updates come from the seller's shop" />
      {extra("packingSlip", "document", "bg-app-peach", "Print the seller's packing slip", "Their logo, thank-you note and SKU. Needs a printer.", slipFee, setSlipFee, "Your fee per parcel (optional)")}
      {extra("stickers", "tag", "bg-app-violet-tint", "Use the seller's stickers or bags", "They send you a pack once. You use one per order and we count it down.", stickerFee, setStickerFee, "Your fee per parcel")}
      <div className={ROW}>
        <SwitchRow checked={offer.custom} onChange={(event) => setOffer({ ...offer, custom: event.target.checked })} icon={<IconTile className="bg-app-sun-tint"><Icon name="box" size={18} /></IconTile>}>
          <RowText title="Custom packaging" sub="Boxes, cards, gift wrap. You quote in chat, per order." />
        </SwitchRow>
      </div>
      {!allowed && (
        <p className="m-0 text-[13px] text-app-ink-soft">
          Packing slips and stickers open at Trusted: 25 delivered orders and a 4.3 rating. <a href="/supplier/level" className="font-bold text-app-accent-ink underline underline-offset-4 hover:text-app-ink">See your level</a>
        </p>
      )}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`m-0 rounded-[14px] px-4 py-3 text-[14px] font-bold ${message.tone === "error" ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {message.text}
        </p>
      )}
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={busy} className={buttonClass.orange}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
