import Link from "next/link";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { PARTNER_LEVELS, PARTNER_LEVEL_LABELS, PARTNER_LEVEL_TIER, PAY_AT_DOOR_STEPS, type LevelGoal, type PartnerLevel } from "@shared/dropship-rules";
import { TIER_UNLOCKS, UNLOCK_WORDS, type FeaturedStatus } from "@shared/partner-reach";
import type { Translate } from "@/components/logistics/kit";

// A delivery partner's reach tier (shared/dropship-rules.ts partnerLevel, shared/partner-reach.ts): Tier 1 Verified →
// Tier 2 Trusted → Tier 3 Top partner. Tiers control reach, not cash: pay on delivery is open from Tier 1 (customers
// pay in the app at the door and riders never hold cash), interstate jobs at Trusted, high-value parcels and "Apply
// to be featured" at Top partner. Shows where the partner is (LevelLadder), what's left to the next tier (GoalList),
// what each tier unlocks (TierUnlocks), the featured application (FeaturedCard) and how pay at the door works
// (PayAtDoorSteps). Used by the level page (/logistics/level); PodLocked is the pay-on-delivery switch on Coverage.
// The view comes from src/lib/logistics/partner-levels.server.ts partnerLevelView. Words come from the "logistics"
// catalog (reach.*) through `t`, English without one.

export interface PartnerLevelViewProps {
  level: PartnerLevel;
  next: PartnerLevel | null;
  goals: LevelGoal[];
  cashCap: number;
  podOpen: boolean;
  podOn: boolean;
  codPaused: boolean;
  lockedMessage: string;
}

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

const LEVEL_WORDS: Record<PartnerLevel, string> = {
  verified: "ID and selfie checked. Prepaid and pay-on-delivery jobs in your areas.",
  trusted: "A clean record: interstate jobs and a higher place in shops' rider lists.",
  cash_trusted: "One of our best: high-value parcels, and you can apply to be featured.",
};

/** The word for a key, from the catalog when there is one. */
const say = (t: Translate | undefined, key: string, fallback: string, values?: Record<string, string | number>) => {
  if (t) return t.dynamic(key, fallback, values);
  return values ? Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), fallback) : fallback;
};

/** "Tier 2 · Trusted", translated. */
export const tierName = (level: PartnerLevel, t?: Translate) =>
  say(t, "reach.tierName", "Tier {tier} · {name}", { tier: PARTNER_LEVEL_TIER[level], name: say(t, `reach.level.${level}`, PARTNER_LEVEL_LABELS[level]) });

const goalValue = (goal: LevelGoal) => (goal.kind === "count" ? `${goal.have.toLocaleString("en-NG")} / ${goal.need.toLocaleString("en-NG")}` : goal.done ? "Done" : "Not yet");

/** One goal (`.g` on A-Rider-POD): the label and "64 / 150" with a forest meter for counts, a green tick for checks. */
export function GoalRow({ goal }: { goal: LevelGoal }) {
  const pct = goal.kind === "count" && goal.need > 0 ? Math.min(100, Math.round((goal.have / goal.need) * 100)) : goal.done ? 100 : 0;
  return (
    <li className="grid gap-1.5 border-b border-app-line-soft py-[11px] last:border-b-0">
      <div className="flex items-center justify-between gap-3 text-[14px] font-bold">
        <span>{goal.label}</span>
        {goal.kind === "count" ? (
          <b className="font-extrabold tabular-nums">{goalValue(goal)}</b>
        ) : (
          <span className={cx("inline-flex items-center gap-1 font-extrabold", goal.done ? "text-app-success" : "text-app-ink-soft")}>
            {goal.done ? <Icon name="check" size={14} strokeWidth={3} /> : null}
            {goalValue(goal)}
          </span>
        )}
      </div>
      {goal.kind === "count" ? (
        <div className="h-2 overflow-hidden rounded-full bg-app-line" role="progressbar" aria-label={`${goal.label}: ${goalValue(goal)}`} aria-valuemin={0} aria-valuemax={goal.need} aria-valuenow={Math.min(goal.have, goal.need)}>
          <div className={cx("h-full rounded-full", goal.done ? "bg-app-success" : "bg-app-forest")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </li>
  );
}

/** The goals in a white list (`.goals`). */
export function GoalList({ goals, className }: { goals: LevelGoal[]; className?: string }) {
  return <ul className={cx("m-0 list-none rounded-[22px] bg-white px-4 py-1 sm:px-5", className)}>{goals.map((goal) => <GoalRow key={goal.key} goal={goal} />)}</ul>;
}

/** How pay on delivery works now, numbered (`.r` on A-Rider-POD): no cash, no code, no drop. */
export function PayAtDoorSteps({ t }: { t?: Translate }) {
  return (
    <ol className="m-0 grid list-none gap-2 p-0 text-[13.5px]">
      {PAY_AT_DOOR_STEPS.map((step, index) => (
        <li key={index} className="flex items-start gap-2.5">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-app-mint text-[12px] font-extrabold text-app-forest" aria-hidden>{index + 1}</span>
          <span className="leading-[1.45]">{say(t, `reach.payAtDoor.${index + 1}`, step)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The pay on delivery switch while it's locked (A-Rider-POD): a forest lock card, the goals and the cash rules. */
export function PodLocked({ view }: { view: PartnerLevelViewProps }) {
  const pausedOnly = view.codPaused;
  return (
    <div className="grid gap-3" role="group" aria-labelledby="pod-locked-title" aria-describedby="pod-locked-why">
      <div className="grid gap-2 rounded-[24px] bg-app-forest p-[18px] text-white sm:p-5">
        <span className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/[0.14]" aria-hidden><Icon name="lock" size={20} strokeWidth={2.2} /></span>
          <span className="rounded-full bg-white/[0.14] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.05em]">Pay on delivery · {pausedOnly ? "Paused" : "Locked"}</span>
        </span>
        <span id="pod-locked-title" className="font-app-display text-[24px] font-extrabold leading-[1.1] tracking-[-0.01em]">{pausedOnly ? "Paused until your cash is in" : "Opens once you're verified"}</span>
        <p id="pod-locked-why" className="m-0 text-[14px] leading-[1.45] text-[#D2EDE8]">
          {pausedOnly ? "Pay on delivery is paused until the cash you collected on older jobs is paid in." : view.lockedMessage}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid content-start gap-2 rounded-[20px] border border-app-line bg-white px-4 py-3 sm:px-5 lg:col-span-2">
          <p className="m-0 font-app-display text-[15px] font-extrabold">How it works</p>
          <PayAtDoorSteps />
          <Link href="/logistics/level" className="mt-1 text-[14px] font-extrabold text-app-forest underline underline-offset-4 hover:text-app-ink">See your level</Link>
        </div>
      </div>
    </div>
  );
}

/** Tier 1 → Tier 2 → Tier 3 on a forest card: a bar per tier, where the partner is, what it means, and Featured. */
export function LevelLadder({ level, featured = false, t }: { level: PartnerLevel; featured?: boolean; t?: Translate }) {
  const at = PARTNER_LEVELS.indexOf(level);
  const name = tierName(level, t);
  return (
    <section aria-labelledby="partner-level-now" className="grid gap-3 rounded-[24px] bg-app-forest p-[18px] text-white sm:p-6">
      <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={say(t, "reach.ladderLabel", "Partner tiers: {name}, tier {at} of {count}", { name, at: at + 1, count: PARTNER_LEVELS.length })}>
        {PARTNER_LEVELS.map((key, index) => (
          <li key={key} aria-current={key === level ? "step" : undefined} className={cx("flex flex-1 flex-col gap-1.5 text-[11px] font-extrabold tracking-[0.04em]", index < at ? "text-app-teal-mid" : index === at ? "text-white" : "text-white/55")}>
            <i aria-hidden className={cx("block h-1.5 rounded-full", index < at ? "bg-app-teal-mid" : index === at ? "bg-white" : "bg-white/20")} />
            <span className="flex items-center gap-1">{index > at ? <Icon name="lock" size={11} strokeWidth={2.6} /> : null}{tierName(key, t).toUpperCase()}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="partner-level-now" className="m-0 font-app-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[32px]">{say(t, "reach.youAre", "You're {name}", { name })}</h2>
        {featured ? <span className="inline-flex items-center gap-1 rounded-full bg-app-mint px-2.5 py-1 text-[12px] font-extrabold text-app-forest"><Icon name="star" size={13} strokeWidth={2.6} />{say(t, "reach.featuredBadge", "Featured")}</span> : null}
      </div>
      <p className="m-0 max-w-[620px] text-[14px] leading-[1.45] text-[#D2EDE8] sm:text-[15px]">{say(t, `reach.words.${level}`, LEVEL_WORDS[level])}</p>
    </section>
  );
}

const NEEDS: Record<PartnerLevel, string> = {
  verified: "ID and selfie passed",
  trusted: "50 delivered · rating 4.3+ · under 2% failed drops · base address verified",
  cash_trusted: "150 delivered · 60+ days on Shopinbos · CAC or a guarantor",
};

/** What each tier unlocks: three cards, ticks up to the partner's tier, locks above it. Faster payouts: coming soon. */
export function TierUnlocks({ level, fasterPayoutsLive, t }: { level: PartnerLevel; fasterPayoutsLive: boolean; t?: Translate }) {
  const at = PARTNER_LEVELS.indexOf(level);
  return (
    <section aria-labelledby="tier-unlocks" className="grid gap-2">
      <h2 id="tier-unlocks" className="m-0 px-1 font-app-display text-[19px] font-extrabold tracking-[-0.01em]">{say(t, "reach.unlocksTitle", "What each tier unlocks")}</h2>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {PARTNER_LEVELS.map((key, index) => {
          const open = index <= at;
          return (
            <li key={key} aria-current={key === level ? "step" : undefined} className={cx("grid content-start gap-2 rounded-[20px] border bg-white px-4 py-3.5", key === level ? "border-app-forest shadow-[0_0_0_1px_var(--color-app-forest)]" : "border-app-line")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-app-display text-[16px] font-extrabold">{tierName(key, t)}</span>
                <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-extrabold", key === level ? "bg-app-forest text-white" : open ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft")}>
                  {!open ? <Icon name="lock" size={11} strokeWidth={2.6} /> : null}
                  {key === level ? say(t, "reach.current", "You're here") : open ? say(t, "reach.unlocked", "Unlocked") : say(t, "reach.locked", "Locked")}
                </span>
              </div>
              <p className="m-0 text-[12.5px] leading-[1.4] text-app-ink-soft">{say(t, `reach.needs.${key}`, NEEDS[key])}</p>
              <ul className="m-0 grid list-none gap-1.5 p-0 text-[13.5px]">
                {TIER_UNLOCKS[key].map((unlock) => (
                  <li key={unlock} className="flex items-start gap-2">
                    <span className={cx("mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full", open ? "bg-app-mint text-app-forest" : "bg-app-canvas text-app-ink-soft")} aria-hidden>
                      <Icon name={open ? "check" : "lock"} size={11} strokeWidth={3} />
                    </span>
                    <span className="leading-[1.4]">
                      {say(t, `reach.unlock.${unlock}`, UNLOCK_WORDS[unlock] ?? unlock)}
                      {unlock === "fasterPayouts" && !fasterPayoutsLive ? <span className="ml-1.5 rounded-full bg-app-canvas px-1.5 py-0.5 text-[11px] font-extrabold text-app-ink-soft">{say(t, "reach.comingSoon", "Coming soon")}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * "Apply to be featured" (Top partners): the state of the application, and the form that sends it (`apply`, a server
 * action). Below Top partner it says when it opens.
 */
export function FeaturedCard({ level, status, featuredNow, note, apply, t }: { level: PartnerLevel; status: FeaturedStatus; featuredNow: boolean; note: string | null; apply: () => Promise<void>; t?: Translate }) {
  const top = level === "cash_trusted";
  const line = featuredNow
    ? say(t, "reach.featured.on", "You're featured. Shops see you first, with a Featured badge.")
    : !top
      ? say(t, "reach.featured.locked", "Opens at Tier 3 · Top partner.")
      : status === "applied"
        ? say(t, "reach.featured.applied", "Applied. The team will look at it soon.")
        : status === "rejected"
          ? say(t, "reach.featured.rejected", "Not approved this time. You can apply again.")
          : say(t, "reach.featured.sub", "Featured partners get a badge and the top place in shops' rider lists.");
  return (
    <section aria-labelledby="featured-title" className="grid gap-2 rounded-[20px] border border-app-line bg-white px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full", featuredNow ? "bg-app-mint text-app-forest" : "bg-app-canvas text-app-ink-soft")} aria-hidden><Icon name={top ? "star" : "lock"} size={18} strokeWidth={2.4} /></span>
        <div className="min-w-0">
          <h2 id="featured-title" className="m-0 font-app-display text-[17px] font-extrabold">{say(t, "reach.featured.title", "Featured partner")}</h2>
          <p className="m-0 text-[13.5px] text-app-ink-soft">{line}</p>
        </div>
      </div>
      {status === "rejected" && note ? <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px]">“{note}”</p> : null}
      {top && !featuredNow && status !== "applied" ? (
        <form action={apply}>
          <button type="submit" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-forest px-5 text-[14.5px] font-extrabold text-white hover:bg-app-ink">
            <Icon name="star" size={15} strokeWidth={2.4} />{say(t, "reach.featured.apply", "Apply to be featured")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

/** Below Trusted: interstate can't be switched on (and was taken off); what they need to get it. */
export function InterstateNote({ t }: { t?: Translate }) {
  return (
    <p role="note" className="m-0 flex items-start gap-2 rounded-[16px] bg-app-warn-tint px-4 py-3 text-[13.5px] leading-[1.45] text-app-ink">
      <Icon name="globe" size={16} strokeWidth={2.2} />
      <span>{say(t, "reach.interstateGated", "Interstate jobs open at Tier 2 · Trusted: 50 delivered jobs, a rating of 4.3 or more, failed drops under 2% and your base address verified. Until then interstate stays off.")}</span>
    </p>
  );
}
