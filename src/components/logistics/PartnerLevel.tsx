import Link from "next/link";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { HIGH_VALUE_ORDER_NAIRA, PARTNER_LEVELS, PARTNER_LEVEL_LABELS, PAY_AT_DOOR_STEPS, type LevelGoal, type PartnerLevel } from "@shared/dropship-rules";

// A delivery partner's tier (shared/dropship-rules.ts partnerLevel): 1 Verified → 2 Trusted → 3 Top partner, the goals
// left to the next one, and what each tier unlocks. Tiers control reach, not cash: pay on delivery is open from Tier 1,
// since customers pay in the app at the door and riders never hold cash. Used by the level page (/logistics/level) and
// the pay-on-delivery switch on Coverage. The view comes from src/lib/logistics/partner-levels.server.ts partnerLevelView.

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
  verified: "ID and selfie checked. Prepaid and pay on delivery jobs in your areas. Your riders never carry cash.",
  trusted: "A clean record: interstate jobs and a higher place in shops' partner lists.",
  cash_trusted: "Our best partners: high-value parcels, a chance to be featured, and the top of shops' lists.",
};

/** What each tier unlocks, for the ladder of perks on the level page. */
export const TIER_PERKS: Array<{ level: PartnerLevel; perks: string[] }> = [
  { level: "verified", perks: ["Prepaid jobs in your areas", "Pay on delivery jobs (customers pay in the app, no cash)"] },
  { level: "trusted", perks: ["Interstate jobs", "A higher place in shops' partner lists"] },
  { level: "cash_trusted", perks: [`High-value parcels (₦${HIGH_VALUE_ORDER_NAIRA.toLocaleString("en-NG")}+: phones, gold)`, "Apply to be featured to shops", "The top of shops' partner lists"] },
];

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
export function PayAtDoorSteps() {
  return (
    <ol className="m-0 grid list-none gap-2 p-0 text-[13.5px]">
      {PAY_AT_DOOR_STEPS.map((step, index) => (
        <li key={index} className="flex items-start gap-2.5">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-app-mint text-[12px] font-extrabold text-app-forest" aria-hidden>{index + 1}</span>
          <span className="leading-[1.45]">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Each tier and what it unlocks, the partner's own tier marked. */
export function TierPerks({ level }: { level: PartnerLevel }) {
  const at = PARTNER_LEVELS.indexOf(level);
  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {TIER_PERKS.map((tier, index) => (
        <li key={tier.level} className={cx("rounded-[18px] border px-4 py-3", index <= at ? "border-app-success/30 bg-app-success-tint/50" : "border-app-line bg-white")}>
          <p className="m-0 flex items-center gap-2 text-[14px] font-extrabold">
            {index <= at ? <Icon name="checkCircle" size={16} className="text-app-success" /> : <Icon name="lock" size={14} className="text-app-ink-faint" />}
            Tier {index + 1} · {PARTNER_LEVEL_LABELS[tier.level]}{index === at ? <span className="rounded-full bg-app-forest px-2 py-0.5 text-[11px] text-white">You</span> : null}
          </p>
          <ul className="m-0 mt-1.5 grid list-none gap-1 p-0 pl-6 text-[13.5px] text-app-ink-soft">
            {tier.perks.map((perk) => <li key={perk}>{perk}</li>)}
          </ul>
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

/** Tier 1 Verified → 2 Trusted → 3 Top partner on a forest card: a bar per level, where the partner is, and what it means. */
export function LevelLadder({ level }: { level: PartnerLevel }) {
  const at = PARTNER_LEVELS.indexOf(level);
  return (
    <section aria-labelledby="partner-level-now" className="grid gap-3 rounded-[24px] bg-app-forest p-[18px] text-white sm:p-6">
      <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={`Partner levels: ${PARTNER_LEVEL_LABELS[level]}, level ${at + 1} of ${PARTNER_LEVELS.length}`}>
        {PARTNER_LEVELS.map((key, index) => (
          <li key={key} aria-current={key === level ? "step" : undefined} className={cx("flex flex-1 flex-col gap-1.5 text-[11px] font-extrabold tracking-[0.04em]", index < at ? "text-app-teal-mid" : index === at ? "text-white" : "text-white/55")}>
            <i aria-hidden className={cx("block h-1.5 rounded-full", index < at ? "bg-app-teal-mid" : index === at ? "bg-white" : "bg-white/20")} />
            <span className="flex items-center gap-1">{index > at ? <Icon name="lock" size={11} strokeWidth={2.6} /> : null}{index + 1} · {PARTNER_LEVEL_LABELS[key].toUpperCase()}</span>
          </li>
        ))}
      </ol>
      <h2 id="partner-level-now" className="m-0 font-app-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[32px]">You&apos;re Tier {at + 1} · {PARTNER_LEVEL_LABELS[level]}</h2>
      <p className="m-0 max-w-[620px] text-[14px] leading-[1.45] text-[#D2EDE8] sm:text-[15px]">{LEVEL_WORDS[level]}</p>
    </section>
  );
}
