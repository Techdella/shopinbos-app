"use client";

import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import type { FindSupplier } from "@/lib/marketplace/find";

// What a seller should know about a supplier before selling their products (shared/supplier-trust.ts): verified or
// not, Shopinbos's risk score and how far away they are ("Far from you": delivery may cost more). Unverified suppliers show too, never hidden behind a tick.

const LEVEL_TONE = {
  low: "bg-app-success-tint text-app-success",
  medium: "bg-[#FDF0D5] text-[#8A5A00]",
  high: "bg-app-danger-tint text-app-danger",
} as const;

export function SupplierTrustBadges({ supplier, compact = false }: { supplier: FindSupplier; compact?: boolean }) {
  const t = useT("marketplace");
  const status = supplier.verificationStatus ?? (supplier.verified ? "verified" : "unverified");
  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", compact ? "text-[11.5px]" : "text-[12.5px]")}>
      {status === "verified" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-app-success-tint px-2 py-0.5 font-extrabold text-app-success"><Icon name="checkCircle" size={12} /> {t("trust.verified")}</span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-app-danger-tint px-2 py-0.5 font-extrabold text-app-danger">{status === "pending" ? t("trust.pending") : t("trust.unverified")}</span>
      )}
      {supplier.risk ? (
        <span className={cx("rounded-full px-2 py-0.5 font-extrabold", LEVEL_TONE[supplier.risk.level])}>{t.dynamic(`trust.risk.${supplier.risk.level}`, supplier.risk.level, { score: supplier.risk.score })}</span>
      ) : null}
      {supplier.far ? <span className="rounded-full bg-[#FDF0D5] px-2 py-0.5 font-extrabold text-[#8A5A00]">{t("sup.farBadge")}</span> : null}
      {typeof supplier.km === "number" ? <span className="font-bold text-app-ink-soft">{t("trust.km", { km: supplier.km < 1 ? "<1" : String(Math.round(supplier.km)) })}</span> : null}
    </div>
  );
}

/** The risk score with its reasons, for the product page. */
export function SupplierRiskDetails({ supplier }: { supplier: FindSupplier }) {
  const t = useT("marketplace");
  if (!supplier.risk) return null;
  return (
    <div className="grid gap-1.5">
      <SupplierTrustBadges supplier={supplier} />
      {supplier.risk.reasons.length ? (
        <ul className="m-0 grid list-disc gap-0.5 pl-5 text-[13px] leading-[1.45]">
          {supplier.risk.reasons.map((reason) => <li key={reason}>{t.dynamic(`trust.reason.${reason}`, reason)}</li>)}
        </ul>
      ) : (
        <p className="m-0 text-[13px]">{t("trust.noReasons")}</p>
      )}
      <p className="m-0 text-[12.5px] leading-[1.45] text-app-ink-soft">{t("trust.riskHelp")}</p>
    </div>
  );
}
