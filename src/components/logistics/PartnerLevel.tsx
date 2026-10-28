import Link from "next/link";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { PARTNER_LEVELS, PARTNER_LEVEL_LABELS, POD_REMIT_HOURS, type LevelGoal, type PartnerLevel } from "@shared/dropship-rules";

// A delivery partner's track-record level (shared/dropship-rules.ts partnerLevel): Verified → Trusted → Cash trusted,
// the goals left to the next one, and pay on delivery, which opens at Cash trusted with a cash cap. Used by the level
// page (/logistics/level) and the locked pay-on-delivery switch on Coverage. The view comes from
// src/lib/logistics/partner-levels.server.ts partnerLevelView.

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
  verified: "ID and documents checked. Prepaid jobs only, so there's no cash to carry.",
  trusted: "A clean record: interstate jobs and a higher place in shops' partner lists.",
  cash_trusted: "Pay on delivery, with a cap on the cash you hold at once.",
};

/** One goal: a meter for counts ("62 / 150"), a tick for checks. */
export function GoalRow({ goal }: { goal: LevelGoal }) {
  const pct = goal.kind === "count" && goal.need > 0 ? Math.min(100, Math.round((goal.have / goal.need) * 100)) : goal.done ? 100 : 0;
  return (
    <li className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="flex items-center gap-2">
          <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full", goal.done ? "bg-app-success text-white" : "border border-app-line-strong")} aria-hidden>
            {goal.done ? <Icon name="check" size={12} /> : null}
          </span>
          {goal.label}
          <span className="sr-only">{goal.done ? " (done)" : " (not yet)"}</span>
        </span>
        {goal.kind === "count" ? (
          <span className="font-mono text-[12.5px] tabular-nums text-app-ink-soft">{goal.have.toLocaleString("en-NG")} / {goal.need.toLocaleString("en-NG")}</span>
        ) : null}
      </div>
      {goal.kind === "count" ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={goal.need} aria-valuenow={Math.min(goal.have, goal.need)}>
          <div className={cx("h-full rounded-full", goal.done ? "bg-app-success" : "bg-app-ink")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </li>
  );
}

/** The three cash rules that come with pay on delivery. */
export function CashRules({ cashCap }: { cashCap: number }) {
  const rules = [
    { icon: "coin" as const, text: `Hold up to ${naira(cashCap)} of customers' cash at a time. Pay on delivery jobs stop showing once you reach it.` },
    { icon: "clock" as const, text: `Pay collected cash into your Shopinbos account within ${POD_REMIT_HOURS} hours.` },
    { icon: "warn" as const, text: "A late pay-in pauses pay on delivery straight away. A second one drops you to Trusted." },
  ];
  return (
    <ul className="m-0 grid list-none gap-2 p-0 text-[14px]">
      {rules.map((rule) => (
        <li key={rule.text} className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-canvas text-app-ink-soft" aria-hidden><Icon name={rule.icon} size={13} /></span>
          <span className="leading-[1.5]">{rule.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The pay on delivery switch while it's locked: why, the goals to Cash trusted and the cash rules. */
export function PodLocked({ view }: { view: PartnerLevelViewProps }) {
  const pausedOnly = view.level === "cash_trusted" && view.codPaused;
  return (
    <div className="grid gap-3 rounded-[16px] border border-dashed border-app-line-strong bg-app-canvas/50 p-4">
      <label className="flex min-h-[44px] items-center gap-2 text-[15px] font-bold text-app-ink-soft">
        <input type="checkbox" disabled aria-describedby="pod-locked-why" className="h-5 w-5" />
        <Icon name="lock" size={15} /> Pay on delivery
        <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em]">{pausedOnly ? "Paused" : "Unlocks at Cash trusted"}</span>
      </label>
      <p id="pod-locked-why" className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">
        {pausedOnly ? "Pay on delivery is paused until your late cash is paid in." : view.lockedMessage}
      </p>
      {!pausedOnly && view.goals.length ? (
        <ul className="m-0 grid list-none gap-3 p-0">
          {view.goals.map((goal) => <GoalRow key={goal.key} goal={goal} />)}
        </ul>
      ) : null}
      <div className="grid gap-2 border-t border-app-line pt-3">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">When it opens</p>
        <CashRules cashCap={view.cashCap} />
      </div>
      <Link href="/logistics/level" className="text-[14px] font-bold text-app-ink underline-offset-4 hover:underline">See your level</Link>
    </div>
  );
}

/** Verified → Trusted → Cash trusted, with where the partner is. */
export function LevelLadder({ level }: { level: PartnerLevel }) {
  const at = PARTNER_LEVELS.indexOf(level);
  return (
    <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
      {PARTNER_LEVELS.map((key, index) => (
        <li
          key={key}
          aria-current={key === level ? "step" : undefined}
          className={cx("grid gap-1 rounded-[18px] border p-4", key === level ? "border-app-ink bg-white" : index < at ? "border-app-line bg-white" : "border-dashed border-app-line-strong bg-app-canvas/50")}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Level {index + 1}{key === level ? " · You" : index < at ? " · Done" : ""}</span>
          <span className="flex items-center gap-2 text-[16px] font-extrabold">
            {index <= at ? <Icon name="checkCircle" size={16} className="text-app-success" /> : <Icon name="lock" size={15} className="text-app-ink-soft" />}
            {PARTNER_LEVEL_LABELS[key]}
          </span>
          <span className="text-[13.5px] leading-[1.5] text-app-ink-soft">{LEVEL_WORDS[key]}</span>
        </li>
      ))}
    </ol>
  );
}
