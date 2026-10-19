"use client";

import { Fold } from "@/components/simple/Fold";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import type inboxEn from "@shared/i18n/messages/inbox/en";

// "Show me how": the click-by-click tour of a one-tap connect (WhatsApp Embedded Signup, Facebook Login for
// Messenger and Instagram). Each step says where the seller is (here, on Facebook, in the Instagram app), what
// happens, and shows the button they'll tap there, drawn the way it looks.

type Where = "here" | "facebook" | "instagram";
type Key = keyof typeof inboxEn & `guide.${string}`;
interface Step {
  where: Where;
  text: Key;
  /** The label of the button they tap, as that screen shows it. */
  click?: Key;
}
export type GuideKind = "whatsapp" | "messenger" | "instagram";

const FB_LOGIN: Step[] = [
  { where: "here", text: "guide.fb.open", click: "guide.click.connectFacebook" },
  { where: "facebook", text: "guide.fb.login", click: "guide.click.continueAs" },
];

const GUIDES: Record<GuideKind, { minutes: number; before?: Step[]; steps: Step[]; tip?: Key }> = {
  whatsapp: {
    minutes: 5,
    steps: [
      { where: "here", text: "guide.wa.open", click: "guide.click.connectFacebook" },
      { where: "facebook", text: "guide.wa.login", click: "guide.click.getStarted" },
      { where: "facebook", text: "guide.wa.business", click: "guide.click.next" },
      { where: "facebook", text: "guide.wa.profile", click: "guide.click.next" },
      { where: "facebook", text: "guide.wa.number", click: "guide.click.sendCode" },
      { where: "facebook", text: "guide.wa.confirm", click: "guide.click.finish" },
      { where: "here", text: "guide.wa.done" },
    ],
    tip: "guide.wa.tip",
  },
  messenger: {
    minutes: 2,
    steps: [
      ...FB_LOGIN,
      { where: "facebook", text: "guide.fb.pickPage", click: "guide.click.continue" },
      { where: "facebook", text: "guide.fb.permissions", click: "guide.click.save" },
      { where: "facebook", text: "guide.fb.gotIt", click: "guide.click.gotIt" },
      { where: "here", text: "guide.fb.done" },
    ],
  },
  instagram: {
    minutes: 4,
    before: [
      { where: "instagram", text: "guide.ig.professional", click: "guide.click.switchPro" },
      { where: "facebook", text: "guide.ig.link", click: "guide.click.connectAccount" },
      { where: "instagram", text: "guide.ig.allow", click: "guide.click.allowAccess" },
    ],
    steps: [
      ...FB_LOGIN,
      { where: "facebook", text: "guide.ig.pickPage", click: "guide.click.continue" },
      { where: "facebook", text: "guide.fb.permissions", click: "guide.click.save" },
      { where: "facebook", text: "guide.fb.gotIt", click: "guide.click.gotIt" },
      { where: "here", text: "guide.ig.done" },
    ],
  },
};

const WHERE_ICON: Record<Where, "sparkle" | "facebook" | "instagram"> = { here: "sparkle", facebook: "facebook", instagram: "instagram" };

/** The button as it looks on that screen: Facebook blue, Instagram blue, or our black pill. */
function Tap({ where, label }: { where: Where; label: string }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold",
        where === "here" ? "bg-app-ink text-white" : where === "facebook" ? "bg-[#1877F2] text-white" : "bg-[#0095F6] text-white",
      )}
    >
      {where === "here" && <Icon name="facebook" size={13} />}
      {label}
    </span>
  );
}

function StepList({ steps, start = 1 }: { steps: Step[]; start?: number }) {
  const t = useT("inbox");
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {steps.map((step, i) => (
        <li key={`${step.text}-${i}`} className="flex gap-3">
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-canvas font-mono text-[12px] font-bold">{start + i}</span>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-app-ink-soft">
              <Icon name={WHERE_ICON[step.where]} size={12} /> {t(`guide.where.${step.where}` as const)}
            </span>
            <span className="text-[13.5px] leading-[1.5]">{t(step.text)}</span>
            {step.click && (
              <span className="flex flex-wrap items-center gap-2 text-[12px] text-app-ink-soft">
                {t("guide.youTap")} <Tap where={step.where} label={t(step.click)} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ConnectGuide({ kind, defaultOpen }: { kind: GuideKind; defaultOpen?: boolean }) {
  const t = useT("inbox");
  const guide = GUIDES[kind];
  const count = guide.steps.length + (guide.before?.length ?? 0);
  return (
    <Fold testId={`guide-${kind}`} defaultOpen={defaultOpen} summary={t("guide.show")} hint={t("guide.hint", { count, minutes: guide.minutes })}>
      <div className="grid gap-4">
        {guide.before && (
          <div className="grid gap-3 rounded-[14px] bg-app-canvas p-3.5">
            <p className="m-0 text-[13px] font-extrabold">{t("guide.before")}</p>
            <StepList steps={guide.before} />
          </div>
        )}
        <StepList steps={guide.steps} start={(guide.before?.length ?? 0) + 1} />
        {guide.tip && <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[12.5px] leading-[1.5] text-app-ink-soft">{t(guide.tip)}</p>}
      </div>
    </Fold>
  );
}
