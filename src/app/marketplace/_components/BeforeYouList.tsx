"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestDropshipAgreement } from "@/app/actions/sourcing";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { AGREEMENT_POINTS, type StockCheck } from "@shared/supplier-trust";
import type { FindSupplier } from "@/lib/marketplace/find";
import { SupplierRiskDetails } from "./SupplierTrust";

// Before a seller lists a supplier's products to dropship: call the supplier, see the stock yourself (a visit or a
// video call), and accept the Dropship agreement, which then goes to the supplier to accept. Only then can the
// product be added (src/lib/marketplace/agreements.server.ts listingCheck enforces it on the server too).

export type ListingStep = "agree" | "waiting" | "declined" | "ready" | "far" | "noPlace";

export interface ListingInfo {
  step: ListingStep;
  phone: string | null;
  address: string | null;
  supplierNote: string | null;
}

const CARD = "rounded-[22px] border border-app-line bg-white";

export function BeforeYouList({ supplier, listing }: { supplier: FindSupplier; listing: ListingInfo }) {
  const t = useT("marketplace");
  const router = useRouter();
  const [called, setCalled] = useState(false);
  const [stockCheck, setStockCheck] = useState<StockCheck | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = supplier.name;
  const phoneHref = listing.phone ? `tel:${listing.phone.replace(/[^\d+]/g, "")}` : null;
  const whatsappHref = listing.phone ? `https://wa.me/${listing.phone.replace(/\D/g, "").replace(/^0/, "234")}` : null;

  function send() {
    if (!supplier.id) return;
    setError(null);
    start(async () => {
      const result = await requestDropshipAgreement({ supplierId: supplier.id!, called, stockCheck: stockCheck ?? "", agreed, note: note.trim() || undefined });
      if (!result.ok) return setError(result.error);
      setSent(result.message);
      router.refresh();
    });
  }

  return (
    <section id="before-you-list" className={cx(CARD, "grid gap-3 p-4")}>
      <div>
        <h2 className="m-0 text-[15px] font-extrabold">{t("trust.beforeTitle", { name })}</h2>
        <p className="m-0 mt-1 text-[13px] leading-[1.5] text-app-ink-soft">{t("trust.beforeSub")}</p>
      </div>
      <SupplierRiskDetails supplier={supplier} />

      {listing.step === "noPlace" ? (
        <p className="m-0 rounded-[14px] bg-[#FDF0D5] px-3 py-2.5 text-[13.5px]">
          {t("trust.addCity")} <Link href="/home/settings" className="font-extrabold text-app-ink">{t("trust.addCityBtn")}</Link>
        </p>
      ) : listing.step === "far" ? (
        <p className="m-0 rounded-[14px] bg-app-canvas px-3 py-2.5 text-[13.5px]">{t("trust.tooFar", { name })}</p>
      ) : listing.step === "waiting" || sent ? (
        <p role="status" className="m-0 rounded-[14px] bg-app-success-tint px-3 py-2.5 text-[13.5px] font-bold text-app-success">{sent ?? t("trust.waiting", { name })}</p>
      ) : (
        <>
          {listing.step === "declined" ? (
            <p className="m-0 rounded-[14px] bg-app-danger-tint px-3 py-2.5 text-[13.5px] text-app-danger">
              {t("trust.declined", { name })}{listing.supplierNote ? ` "${listing.supplierNote}"` : ""}
            </p>
          ) : null}
          <ol className="m-0 grid list-none gap-3 p-0">
            <li className="grid gap-2 rounded-[14px] bg-app-canvas p-3">
              <span className="text-[14px] font-extrabold">1. {t("trust.step.call", { name })}</span>
              {listing.phone ? (
                <div className="flex flex-wrap gap-2">
                  <a href={phoneHref!} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white no-underline"><Icon name="phone" size={15} /> {listing.phone}</a>
                  <a href={whatsappHref!} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink no-underline">WhatsApp</a>
                </div>
              ) : (
                <span className="text-[13px] text-app-ink-soft">{t("trust.noPhone")}</span>
              )}
              <span className="text-[12.5px] leading-[1.45] text-app-ink-soft">{t("trust.callAsk")}</span>
              <label className="flex items-center gap-2 text-[13.5px] font-bold">
                <input type="checkbox" checked={called} onChange={(event) => setCalled(event.target.checked)} className="h-4 w-4" /> {t("trust.called", { name })}
              </label>
            </li>
            <li className="grid gap-2 rounded-[14px] bg-app-canvas p-3">
              <span className="text-[14px] font-extrabold">2. {t("trust.step.stock")}</span>
              {listing.address ? <span className="text-[13px]">{t("trust.where", { address: listing.address })}</span> : null}
              <div className="flex flex-wrap gap-2">
                {(["visit", "video"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setStockCheck(value)} aria-pressed={stockCheck === value} className={cx("min-h-[40px] rounded-full border px-4 text-[13.5px] font-extrabold", stockCheck === value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}>
                    {value === "visit" ? t("trust.visit") : t("trust.video")}
                  </button>
                ))}
              </div>
            </li>
            <li className="grid gap-2 rounded-[14px] bg-app-canvas p-3">
              <span className="text-[14px] font-extrabold">3. {t("trust.step.agree")}</span>
              <ul className="m-0 grid list-disc gap-1 pl-5 text-[13px] leading-[1.45]">
                {Array.from({ length: AGREEMENT_POINTS }, (_, index) => <li key={index}>{t.dynamic(`trust.point.${index}`, "")}</li>)}
              </ul>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={600} placeholder={t("trust.notePh")} className="w-full rounded-[12px] border border-app-line bg-white px-3 py-2 text-[13.5px]" />
              <label className="flex items-start gap-2 text-[13.5px] font-bold">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4" /> {t("trust.agree", { name })}
              </label>
            </li>
          </ol>
          {error ? <p role="alert" className="m-0 text-[13.5px] font-bold text-app-danger">{error}</p> : null}
          <button type="button" onClick={send} disabled={pending || !called || !stockCheck || !agreed} className="inline-flex min-h-[50px] w-full items-center justify-center rounded-full bg-app-accent px-5 text-[15px] font-extrabold text-white disabled:opacity-50">
            {pending ? t("trust.sending") : t("trust.send", { name })}
          </button>
        </>
      )}
    </section>
  );
}
