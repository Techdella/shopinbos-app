"use client";

import { useState, useTransition } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { chooseReferralReward } from "@/app/actions/referrals";
import { friendlyError } from "@/lib/errors/report-client";
import { PLAN_LABEL, REFERRAL_MILESTONES, REFERRAL_OFFERS, REFERRAL_ROLES, welcomeText, type ReferralRole, type RewardChoice } from "@shared/referrals";
import type { ReferralOverview } from "@/lib/referrals/service.server";

// Refer & earn (sellers, suppliers, delivery partners): your invite link, what you and they get, your reward choice,
// milestones, and everyone who joined with your link and how far they are.

const APP = "https://app.shopinbos.com";

const SHARE: Record<ReferralRole, string> = {
  supplier: "I sell to shops through Shopinbos and thought of you. List your products once and shops across Nigeria can order from you. Join with my link and you get a free month of Supplier Plus and a featured week:",
  seller: "I use Shopinbos for my business: Rex builds your online store with you and Peggy answers customers on WhatsApp. Join with my link and you get a free month of Starter and 100 AI credits:",
  logistics_partner: "Shops on Shopinbos need deliveries near you. Join as a delivery partner with my link and you get a free month of Logistics Plus:",
};

const TONE: Record<string, string> = {
  signed_up: "bg-[#FFF4E0] text-[#8A5A12]",
  qualified: "bg-[#EEF7F5] text-[#1F5F5A]",
  rewarded: "bg-app-success-tint text-app-success",
  rejected: "bg-app-canvas text-app-ink-soft",
};

export function ReferEarn({ overview, focus }: { overview: ReferralOverview; focus: ReferralRole | null }) {
  const [choice, setChoice] = useState<RewardChoice>(overview.rewardChoice);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const order = focus ? [focus, ...REFERRAL_ROLES.filter((role) => role !== focus)] : (["supplier", "seller", "logistics_partner"] as ReferralRole[]);
  const link = (role?: ReferralRole) => `${APP}/r/${overview.code}${role ? `?for=${role}` : ""}`;
  const nextMilestone = REFERRAL_MILESTONES.find((milestone) => milestone.count > overview.counts.rewarded);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  };

  const pick = (next: RewardChoice) => {
    setChoice(next);
    setError(null);
    start(async () => {
      try {
        const result = await chooseReferralReward(next);
        if (!result.ok) setError(result.error);
      } catch (caught) {
        setError(friendlyError(caught, "Couldn't save your choice. Try again."));
      }
    });
  };

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-[24px] bg-[#0E2A38] p-6 text-white sm:p-8">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#73D8C8]">Refer &amp; earn</p>
        <h2 className="mb-2 mt-2 max-w-[620px] text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
          Invite businesses you know. Get free months or AI credits for each one.
        </h2>
        <p className="m-0 max-w-[620px] text-[15px] leading-[1.55] text-white/75">
          Refer a supplier and get {REFERRAL_OFFERS.supplier.referrerMonths} months free or {REFERRAL_OFFERS.supplier.referrerCredits} AI credits (that&apos;s about {Math.round(REFERRAL_OFFERS.supplier.referrerCredits / 10)} Rex videos). They get a welcome gift too.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-[18px] bg-white/10 p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[14px]">{link()}</span>
          <button type="button" onClick={() => void copy(link(), "main")} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#73D8C8] px-5 text-[14px] font-extrabold text-[#0E2A38]">
            <Icon name={copied === "main" ? "check" : "copy"} size={15} /> {copied === "main" ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="mb-0 mt-3 text-[13px] text-white/60">Your code: <span className="font-mono font-bold text-white">{overview.code}</span></p>
      </section>

      <section aria-labelledby="refer-who" className="grid gap-3 md:grid-cols-3">
        <h2 id="refer-who" className="sr-only">Who you can invite</h2>
        {order.map((role) => {
          const offer = REFERRAL_OFFERS[role];
          const message = `${SHARE[role]} ${link(role)}`;
          return (
            <article key={role} className={cx("flex flex-col rounded-[20px] border bg-white p-5", focus === role ? "border-[#2E7E78]" : "border-app-line")}>
              <h3 className="m-0 text-[17px] font-extrabold">Refer {offer.noun}</h3>
              <p className="mb-0 mt-2 text-[14px] leading-[1.5]">
                <span className="font-bold">You get:</span> {offer.referrerMonths} month{offer.referrerMonths === 1 ? "" : "s"} free or {offer.referrerCredits} AI credits
              </p>
              <p className="mb-0 mt-1 text-[14px] leading-[1.5]"><span className="font-bold">They get:</span> {welcomeText(role)}</p>
              <p className="mb-4 mt-1 flex-1 text-[13px] leading-[1.5] text-app-ink-soft">Counts when: {offer.rule.toLowerCase()}.</p>
              <div className="grid gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-[14px] font-extrabold text-white no-underline">
                  <Icon name="whatsapp" size={16} /> Share on WhatsApp
                </a>
                <button type="button" onClick={() => void copy(message, role)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold">
                  <Icon name={copied === role ? "check" : "copy"} size={15} /> {copied === role ? "Copied" : "Copy message"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="refer-list" className="min-w-0 rounded-[20px] border border-app-line bg-white p-5">
          <h2 id="refer-list" className="m-0 text-[18px] font-extrabold">Businesses you invited</h2>
          <p className="mb-4 mt-1 text-[13.5px] text-app-ink-soft">
            {overview.counts.joined} joined · {overview.counts.waiting} on their way · {overview.counts.rewarded} rewarded
          </p>
          {overview.referrals.length === 0 ? (
            <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-6 text-center text-[14px] text-app-ink-soft">No one yet. Share your link on WhatsApp: it takes ten seconds.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {overview.referrals.map((referral) => (
                <li key={referral.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-app-line px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold">{referral.name}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">
                      {REFERRAL_OFFERS[referral.role].noun.replace(/^an? /, "")} · joined {new Date(referral.joinedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                      {referral.progress ? ` · ${referral.progress}` : ""}
                      {referral.reason ? ` · ${referral.reason}` : ""}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2.5 py-1 text-[12px] font-extrabold", TONE[referral.status])}>{referral.reward ?? referral.statusLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-5">
          {overview.loyalty && (
            <section aria-labelledby="refer-level" className="rounded-[20px] border border-app-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: overview.loyalty.color }} aria-hidden />
                <h2 id="refer-level" className="m-0 text-[17px] font-extrabold">{overview.loyalty.tierName} member</h2>
                {overview.loyalty.founding && <span className="rounded-full bg-app-success-tint px-2.5 py-0.5 text-[12px] font-extrabold text-app-success">Founding member</span>}
              </div>
              <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[13.5px]">
                {overview.loyalty.perks.map((perk) => <li key={perk}>• {perk}</li>)}
              </ul>
              <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">
                {overview.loyalty.next
                  ? `Reach level ${overview.loyalty.next.atLevel} for ${overview.loyalty.next.tierName}: ${overview.loyalty.next.monthlyCredits} free AI credits every month. Levels grow as you sell, deliver and reply fast.`
                  : "You're at our top tier. Thank you!"}
              </p>
            </section>
          )}
          <section aria-labelledby="refer-choice" className="rounded-[20px] border border-app-line bg-white p-5">
            <h2 id="refer-choice" className="m-0 text-[17px] font-extrabold">Your reward</h2>
            {overview.paying ? (
              <p className="mb-0 mt-2 text-[14px] leading-[1.5] text-app-ink-soft">You pay for your plan by card, so your rewards come as AI credits (free months can&apos;t be added to a card subscription).</p>
            ) : (
              <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Your reward">
                {([
                  ["months", `Free months of ${PLAN_LABEL[overview.role]}`, "Your plan's extras, free, for as long as you've earned."],
                  ["credits", "AI credits", "For Rex videos, product photos, store designs and more."],
                ] as const).map(([value, title, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={choice === value}
                    disabled={pending}
                    onClick={() => pick(value)}
                    className={cx("rounded-[14px] border px-3 py-2.5 text-left", choice === value ? "border-app-ink bg-app-canvas" : "border-app-line bg-white")}
                  >
                    <span className="flex items-center gap-2 text-[14.5px] font-bold">
                      <span className={cx("grid h-4 w-4 place-items-center rounded-full border-2", choice === value ? "border-app-ink" : "border-app-line-strong")} aria-hidden>
                        {choice === value && <span className="h-2 w-2 rounded-full bg-app-ink" />}
                      </span>
                      {title}
                    </span>
                    <span className="mt-0.5 block pl-6 text-[12.5px] text-app-ink-soft">{hint}</span>
                  </button>
                ))}
              </div>
            )}
            {error && <p role="alert" className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{error}</p>}
            {overview.freeUntil && (
              <p className="mb-0 mt-3 rounded-[12px] bg-app-success-tint px-3 py-2 text-[13px] font-bold text-app-success">
                Free plan time until {new Date(overview.freeUntil).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </section>

          <section aria-labelledby="refer-earned" className="rounded-[20px] border border-app-line bg-white p-5">
            <h2 id="refer-earned" className="m-0 text-[17px] font-extrabold">Earned so far</h2>
            <p className="mb-0 mt-2 text-[24px] font-extrabold tracking-[-0.02em]">
              {overview.earned.months} month{overview.earned.months === 1 ? "" : "s"} · {overview.earned.credits.toLocaleString("en-NG")} credits
            </p>
            <ol className="m-0 mt-4 grid list-none gap-2 p-0">
              {REFERRAL_MILESTONES.map((milestone) => {
                const reached = overview.counts.rewarded >= milestone.count;
                return (
                  <li key={milestone.count} className="flex items-center gap-2 text-[13.5px]">
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold", reached ? "bg-app-forest text-white" : "bg-app-canvas text-app-ink-soft")}>
                      {reached ? <Icon name="check" size={12} /> : milestone.count}
                    </span>
                    <span className={reached ? "font-bold" : "text-app-ink-soft"}>{milestone.count} businesses: {milestone.label}</span>
                  </li>
                );
              })}
            </ol>
            {nextMilestone && (
              <p className="mb-0 mt-3 text-[12.5px] text-app-ink-soft">{nextMilestone.count - overview.counts.rewarded} more to your next milestone.</p>
            )}
          </section>

          <p className="m-0 text-[12px] leading-[1.5] text-app-ink-faint">
            Rewards are free plan time or AI credits, never cash. Up to 10 rewards a year; free months stack up to 12 months ahead; credits last 12 months. Invites from the same person, phone or email don&apos;t count.
          </p>
        </aside>
      </div>
    </div>
  );
}
