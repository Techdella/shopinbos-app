import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { getT } from "@/lib/i18n/server";
import { profileInvitePath, signupPath, type ReferralRole } from "@shared/referrals";

// "Powered by Shopinbos" on a supplier's or delivery partner's public profile. Its join buttons go through the owner's
// invite link marked src=profile, so whoever joins from the page counts as the owner's referral (shared/referrals.ts).

const JOIN: { role: ReferralRole; icon: "store" | "package" | "truck"; key: "badge.seller" | "badge.supplier" | "badge.partner" }[] = [
  { role: "seller", icon: "store", key: "badge.seller" },
  { role: "supplier", icon: "package", key: "badge.supplier" },
  { role: "logistics_partner", icon: "truck", key: "badge.partner" },
];

/** The small pill for the page header; it jumps to the panel below. */
export async function PoweredByPill() {
  const t = await getT("marketplace");
  return (
    <a href="#powered-by-shopinbos" className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-app-line bg-app-canvas px-3 text-[12px] font-bold text-app-ink no-underline hover:border-app-line-strong">
      <Icon name="sparkle" size={13} /> {t("badge.powered")}
    </a>
  );
}

/** The panel at the bottom of the page. `code` is the owner's invite code; `isOwner` adds a note for them. */
export async function PoweredByShopinbos({ name, code, isOwner }: { name: string; code: string | null; isOwner: boolean }) {
  const t = await getT("marketplace");
  return (
    <section id="powered-by-shopinbos" aria-labelledby="powered-by-title" className="dot-grid relative mt-5 overflow-hidden rounded-[22px] bg-[#0E2A38] p-6 text-white sm:p-8">
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#73D8C8]">{t("badge.powered")}</p>
      <h2 id="powered-by-title" className="mb-0 mt-3 max-w-[640px] text-balance text-[22px] font-bold leading-[1.15] tracking-[-0.025em] sm:text-[28px]">
        {t("badge.title", { name })}
      </h2>
      <p className="mb-0 mt-3 max-w-[600px] text-pretty text-[14.5px] leading-[1.6] text-white/65">{t("badge.sub")}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {JOIN.map((item, index) => (
          <Link
            key={item.role}
            href={code ? profileInvitePath(code, item.role) : signupPath(item.role)}
            className={
              index === 0
                ? "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#73D8C8] px-5 text-[14px] font-bold text-[#0E2A38] no-underline transition hover:brightness-105"
                : "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-[14px] font-bold text-white no-underline transition hover:bg-white/[0.12]"
            }
          >
            <Icon name={item.icon} size={15} /> {t(item.key)}
          </Link>
        ))}
      </div>
      {isOwner && <p className="mb-0 mt-4 max-w-[600px] text-[12.5px] leading-[1.5] text-white/55">{t("badge.owner")}</p>}
    </section>
  );
}
