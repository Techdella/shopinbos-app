"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Mascot } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { BuyCreditsButton } from "@/components/credits/CreditsBadge";
import { inAppSessionClient } from "@/lib/app-session";
import { formatDate } from "@shared/i18n";
import { REX_STUDIO_STARTERS, rexStudioStarterHref, type RexStudioMeterState, type RexStudioStarterId } from "@shared/rex-studio-welcome";

// "You have 20 credits to try Rex Studio" on the web (rules in shared/rex-studio-welcome.ts): three one-tap starters
// that open Rex Studio with the request filled in (nothing is made until the seller sends it), a credits meter, and
// when the credits run low or out, the usual out-of-credits words with "Top up credits" (the top-up popup with the
// packs and prices). On pages the phone app opened there's no buying: only that the plan's credits refill.
// Home passes `view` from the server; the "is live" screen can drop in <RexStudioWelcomeSlot /> (it fetches its own).

export interface RexStudioWelcomeCardView {
  granted: number;
  balance: number;
  target: number;
  percent: number;
  state: RexStudioMeterState;
  expiresAt: string | null;
  product: string | null;
  costs: { photo: number; video: number; image: number };
}

const ICON: Record<RexStudioStarterId, IconName> = { video: "play", photos: "image", flyer: "megaphone" };

export function RexStudioWelcomeCard({ view, className }: { view: RexStudioWelcomeCardView; className?: string }) {
  const t = useT("credits");
  const locale = useLocale();
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(inAppSessionClient()), []);

  const starter = (id: RexStudioStarterId) => {
    const product = view.product;
    if (id === "video") return { label: product ? t("rs.starter.video", { product }) : t("rs.starter.videoShop"), prompt: product ? t("rs.prompt.video", { product }) : t("rs.prompt.videoShop"), cost: t("rs.costFrom", { count: view.costs.video }) };
    if (id === "photos") return { label: product ? t("rs.starter.photos", { product }) : t("rs.starter.photosShop"), prompt: product ? t("rs.prompt.photos", { product }) : t("rs.prompt.photosShop"), cost: t("rs.costEach", { count: view.costs.photo }) };
    return { label: t("rs.starter.flyer"), prompt: t("rs.prompt.flyer"), cost: t("rs.costFrom", { count: view.costs.image }) };
  };

  return (
    <section className={cx("rounded-[22px] bg-app-ink p-5 text-white sm:p-6", className)} data-testid="rex-studio-welcome">
      <div className="flex items-start gap-3">
        <Mascot name="rex" mood="wave" className="h-14 w-14 shrink-0" alt="" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/70">{t("rs.eyebrow")}</div>
          <h2 className="m-0 mt-1 text-[20px] font-extrabold leading-tight">{t("rs.title", { count: view.balance })}</h2>
          <p className="m-0 mt-1 text-[14px] text-white/80">{t("rs.sub")}</p>
        </div>
      </div>

      {/* The credits meter */}
      <div className="mt-4" role="meter" aria-valuemin={0} aria-valuemax={view.target} aria-valuenow={Math.min(view.balance, view.target)} aria-label={t("rs.meter", { count: view.balance, target: view.target })}>
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="font-bold">{t("rs.meter", { count: view.balance, target: view.target })}</span>
          {view.expiresAt && view.granted > 0 ? <span className="text-white/70">{t("rs.expires", { date: formatDate(new Date(view.expiresAt), locale, { day: "numeric", month: "long" }) })}</span> : null}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
          <div className={cx("h-full rounded-full", view.state === "plenty" ? "bg-[#73D8C8]" : view.state === "low" ? "bg-[#F2A93B]" : "bg-[#E86A4F]")} style={{ width: `${view.percent}%` }} />
        </div>
      </div>

      {view.state === "plenty" ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {REX_STUDIO_STARTERS.map((id) => {
            const item = starter(id);
            return (
              <Link key={id} href={rexStudioStarterHref(item.prompt, "web")} data-testid={`rex-studio-starter-${id}`} className="flex min-h-[56px] items-center gap-3 rounded-[16px] bg-white/10 px-4 py-2.5 text-white no-underline hover:bg-white/15">
                <Icon name={ICON[id]} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-extrabold">{item.label}</span>
                  <span className="block text-[12px] text-white/70">{item.cost}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 rounded-[16px] bg-white/10 p-4" role="status">
          <p className="m-0 text-[14px] font-bold">{view.state === "out" ? t("rs.out") : t("rs.low")}</p>
          {inApp ? null : (
            <>
              <p className="m-0 text-[13px] text-white/80">{t("rs.outWeb")}</p>
              <BuyCreditsButton label={t("rs.topUp")} className="bg-white text-app-ink" />
            </>
          )}
        </div>
      )}

      <Link href="/studio" className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/25 px-4 text-[13.5px] font-bold text-white no-underline hover:bg-white/10">
        <Icon name="sparkle" size={14} /> {t("rs.open")}
      </Link>
    </section>
  );
}

/** The card fetched on its own (GET /api/app/rex-studio), for screens without the data, e.g. the "is live" step. */
export function RexStudioWelcomeSlot({ className }: { className?: string }) {
  const [view, setView] = useState<RexStudioWelcomeCardView | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/app/rex-studio", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: { welcome?: RexStudioWelcomeCardView | null } } | null) => {
        if (live) setView(json?.data?.welcome ?? null);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);
  return view ? <RexStudioWelcomeCard view={view} className={className} /> : null;
}
