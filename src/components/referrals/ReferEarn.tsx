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

const ROLE_ICON: Record<ReferralRole, "store" | "package" | "truck"> = { seller: "store", supplier: "package", logistics_partner: "truck" };

const TONE: Record<string, string> = {
  signed_up: "bg-[#FFF4E0] text-[#8A5A12]",
  qualified: "bg-[#EEF7F5] text-[#1F5F5A]",
  rewarded: "bg-app-success-tint text-app-success",
  rejected: "bg-app-canvas text-app-ink-soft",
};

function BusinessAvatar({ name, url, size, className }: { name: string; url: string | null; size: number; className?: string }) {
  const style = { width: size, height: size };
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" style={style} className={cx("shrink-0 rounded-full border border-black/[0.06] bg-white object-cover", className)} />;
  return (
    <span aria-hidden style={{ ...style, fontSize: Math.round(size * 0.38) }} className={cx("grid shrink-0 place-items-center rounded-full bg-[#0E2A38] font-bold text-[#73D8C8]", className)}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

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
      <section className="dot-grid relative overflow-hidden rounded-[22px] bg-[#0E2A38] p-6 text-white sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end">
          <div>
            <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#73D8C8]">Refer &amp; earn</p>
            <h2 className="mb-0 mt-3 max-w-[560px] text-balance text-[24px] font-bold leading-[1.15] tracking-[-0.025em] sm:text-[30px]">
              Invite businesses you know. Get free months or AI credits for each one.
            </h2>
            <p className="mb-0 mt-3 max-w-[540px] text-pretty text-[14.5px] leading-[1.6] text-white/65">
              Refer a supplier and get {REFERRAL_OFFERS.supplier.referrerMonths} months free or {REFERRAL_OFFERS.supplier.referrerCredits} AI credits (about {Math.round(REFERRAL_OFFERS.supplier.referrerCredits / 10)} Rex videos). They get a welcome gift too.
            </p>
          </div>
          <div>
            <div className="mb-4 flex items-center gap-3">
              <BusinessAvatar name={overview.business.name} url={overview.business.avatarUrl} size={44} className="border-white/15" />
              <span className="min-w-0 leading-[1.25]">
                <span className="block truncate text-[15px] font-semibold">{overview.business.name}</span>
                <span className="block text-[12.5px] text-white/55">This is how your invites show you</span>
              </span>
            </div>
            <p className="mb-2 mt-0 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/50">Your invite link</p>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] p-1.5 pl-4">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-white/90">{link().replace(/^https:\/\//, "")}</span>
              <button type="button" onClick={() => void copy(link(), "main")} className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full bg-[#73D8C8] px-4 text-[13.5px] font-bold text-[#0E2A38] transition hover:brightness-105">
                <Icon name={copied === "main" ? "check" : "copy"} size={14} /> {copied === "main" ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="mb-0 mt-2.5 pl-4 text-[12.5px] text-white/50">
              Code <span className="ml-1 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-[0.06em] text-white">{overview.code}</span>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="refer-who" className="grid gap-4 md:grid-cols-3">
        <h2 id="refer-who" className="sr-only">Who you can invite</h2>
        {order.map((role) => {
          const offer = REFERRAL_OFFERS[role];
          const message = `${SHARE[role]} ${link(role)}`;
          return (
            <article key={role} className={cx("flex flex-col rounded-[18px] border bg-white p-5", focus === role ? "border-[#2E7E78]/50" : "border-app-line")}>
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#EEF7F5] text-[#1F5F5A]">
                  <Icon name={ROLE_ICON[role]} size={17} />
                </span>
                <h3 className="m-0 text-[16px] font-bold tracking-[-0.01em]">Refer {offer.noun}</h3>
              </div>
              <dl className="m-0 mt-4 grid gap-3">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-ink-faint">You get</dt>
                  <dd className="m-0 mt-1 text-[14px] font-semibold leading-[1.45]">
                    {offer.referrerMonths} month{offer.referrerMonths === 1 ? "" : "s"} free or {offer.referrerCredits} AI credits
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-ink-faint">They get</dt>
                  <dd className="m-0 mt-1 text-[14px] leading-[1.45] text-app-ink-soft">{welcomeText(role)}</dd>
                </div>
              </dl>
              <p className="mb-4 mt-4 flex-1 border-t border-dashed border-app-line pt-3 text-[12.5px] leading-[1.5] text-app-ink-faint">Counts when {offer.rule.charAt(0).toLowerCase() + offer.rule.slice(1)}.</p>
              <div className="flex gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-[13.5px] font-bold text-white no-underline transition hover:brightness-95">
                  <Icon name="whatsapp" size={15} /> Share on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => void copy(message, role)}
                  aria-label={copied === role ? "Message copied" : "Copy message"}
                  title="Copy message"
                  className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-full border border-app-line bg-white text-app-ink transition hover:border-app-line-strong"
                >
                  <Icon name={copied === role ? "check" : "copy"} size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="refer-list" className="min-w-0 rounded-[18px] border border-app-line bg-white p-5">
          <h2 id="refer-list" className="m-0 text-[16px] font-bold tracking-[-0.01em]">Businesses you invited</h2>
          <p className="mb-4 mt-1 text-[13.5px] text-app-ink-soft">
            {overview.counts.joined} joined · {overview.counts.waiting} on their way · {overview.counts.rewarded} rewarded
          </p>
          {overview.referrals.length === 0 ? (
            <p className="m-0 rounded-[14px] border border-dashed border-app-line bg-app-canvas/60 px-4 py-8 text-center text-[13.5px] text-app-ink-soft">No one yet. Share your link on WhatsApp: it takes ten seconds.</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {overview.referrals.map((referral) => (
                <li key={referral.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-app-line px-3 py-2.5">
                  <BusinessAvatar name={referral.name} url={referral.avatarUrl} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{referral.name}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">
                      {REFERRAL_OFFERS[referral.role].noun.replace(/^an? /, "")} · joined {new Date(referral.joinedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                      {referral.progress ? ` · ${referral.progress}` : ""}
                      {referral.reason ? ` · ${referral.reason}` : ""}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2.5 py-1 text-[12px] font-semibold", TONE[referral.status])}>{referral.reward ?? referral.statusLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-5">
          {overview.loyalty && (
            <section aria-labelledby="refer-level" className="rounded-[18px] border border-app-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: overview.loyalty.color }} aria-hidden />
                <h2 id="refer-level" className="m-0 text-[16px] font-bold tracking-[-0.01em]">{overview.loyalty.tierName} member</h2>
                {overview.loyalty.founding && <span className="rounded-full bg-app-success-tint px-2.5 py-0.5 text-[11.5px] font-semibold text-app-success">Founding member</span>}
              </div>
              <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-[13.5px]">
                {overview.loyalty.perks.map((perk) => <li key={perk} className="flex gap-2"><Icon name="check" size={14} className="mt-[3px] shrink-0 text-app-forest" />{perk}</li>)}
              </ul>
              <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">
                {overview.loyalty.next
                  ? `Reach level ${overview.loyalty.next.atLevel} for ${overview.loyalty.next.tierName}: ${overview.loyalty.next.monthlyCredits} free AI credits every month. Levels grow as you sell, deliver and reply fast.`
                  : "You're at our top tier. Thank you!"}
              </p>
            </section>
          )}
          <section aria-labelledby="refer-choice" className="rounded-[18px] border border-app-line bg-white p-5">
            <h2 id="refer-choice" className="m-0 text-[16px] font-bold tracking-[-0.01em]">Your reward</h2>
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
                    <span className="flex items-center gap-2 text-[14px] font-semibold">
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
              <p className="mb-0 mt-3 rounded-[12px] bg-app-success-tint px-3 py-2 text-[13px] font-semibold text-app-success">
                Free plan time until {new Date(overview.freeUntil).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </section>

          <section aria-labelledby="refer-earned" className="rounded-[18px] border border-app-line bg-white p-5">
            <h2 id="refer-earned" className="m-0 text-[16px] font-bold tracking-[-0.01em]">Earned so far</h2>
            <p className="mb-0 mt-2 font-mono text-[22px] font-semibold tracking-[-0.02em]">
              {overview.earned.months} month{overview.earned.months === 1 ? "" : "s"} · {overview.earned.credits.toLocaleString("en-NG")} credits
            </p>
            <ol className="m-0 mt-4 grid list-none gap-2 p-0">
              {REFERRAL_MILESTONES.map((milestone) => {
                const reached = overview.counts.rewarded >= milestone.count;
                return (
                  <li key={milestone.count} className="flex items-center gap-2 text-[13.5px]">
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", reached ? "bg-app-forest text-white" : "bg-app-canvas text-app-ink-soft")}>
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

          <a href="/story" className="block rounded-[18px] border border-app-line bg-white p-4 no-underline hover:border-app-line-strong">
            <span className="flex items-center gap-2 text-[14px] font-bold text-app-ink"><Icon name="chat" size={15} /> Share your story</span>
            <span className="mt-1 block text-[12.5px] leading-[1.5] text-app-ink-soft">Tell other businesses what changed for you. It appears in Rex &amp; Peggy&apos;s tips, only with your say-so.</span>
          </a>

          <p className="m-0 text-[12px] leading-[1.5] text-app-ink-faint">
            Rewards are free plan time or AI credits, never cash. Up to 10 rewards a year; free months stack up to 12 months ahead; credits last 12 months. Invites from the same person, phone or email don&apos;t count.
          </p>
        </aside>
      </div>
    </div>
  );
}
