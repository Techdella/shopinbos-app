"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { SetupStep } from "@/lib/setup/checklist";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

// The two helpers beside the checklist. Peggy runs setup through her tools (POST /api/app/peggy: payment
// methods, delivery areas, setup status, copy); Rex does the store and design side in Rex Studio.

interface PeggyAction {
  tool: string;
  summary: string;
  href?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: PeggyAction[];
  failed?: boolean;
}

const open = (step: SetupStep) => !step.done && !step.skipped;

export function StartHelpers({ steps, onChanged }: { steps: SetupStep[]; onChanged: () => void }) {
  return (
    <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1" data-tour="start-helpers">
      <PeggyHelper steps={steps} onChanged={onChanged} />
      <RexHelper steps={steps} />
    </div>
  );
}

function PeggyHelper({ steps, onChanged }: { steps: SetupStep[]; onChanged: () => void }) {
  const t = useT("home", "common");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    ...steps.filter((step) => open(step) && step.helper?.who === "peggy").map((step) => t.dynamic(`prompt.${step.helper!.prompt}`, step.helper!.prompt)),
    t("peggy.whatsLeft"),
  ].slice(0, 4);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim().slice(0, 4000);
    if (!message || busy) return;
    const history = [...turns.filter((turn) => !turn.failed), { role: "user" as const, content: message }];
    setTurns((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/app/peggy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20).map(({ role, content }) => ({ role, content })) }),
      });
      const body = (await response.json().catch(() => null)) as { data?: { text: string; actions: PeggyAction[] }; error?: { message?: string } } | null;
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? t("peggy.cantAnswer"));
      setTurns((current) => [...current, { role: "assistant", content: body.data!.text, actions: body.data!.actions }]);
      if (body.data.actions.length) onChanged();
    } catch (error) {
      setTurns((current) => [...current, { role: "assistant", content: error instanceof Error ? friendlyError(error) : t("peggy.cantAnswer"), failed: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ask-peggy-title" className="flex flex-col rounded-[22px] bg-app-mint p-5">
      <div className="flex items-center gap-3">
        <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="" />
        <div className="min-w-0">
          <h2 id="ask-peggy-title" className="m-0 text-[17px] font-extrabold">{t("peggy.title")}</h2>
          <p className="m-0 text-[13px] leading-[1.4] text-app-ink-soft">{t("peggy.sub")}</p>
        </div>
      </div>

      {turns.length > 0 && (
        <div className="mt-4 grid max-h-[360px] gap-2.5 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((turn, index) =>
            turn.role === "user" ? (
              <div key={index} className="ml-8 justify-self-end rounded-[18px] rounded-br-[6px] bg-app-ink px-3.5 py-2.5 text-[14px] leading-[1.45] text-white">{turn.content}</div>
            ) : (
              <div key={index} className="mr-4 rounded-[18px] rounded-bl-[6px] bg-white px-3.5 py-2.5 text-[14px] leading-[1.5]">
                <p className={turn.failed ? "m-0 whitespace-pre-wrap text-app-danger" : "m-0 whitespace-pre-wrap"}>{turn.content}</p>
                {turn.actions?.map((action, actionIndex) => (
                  <div key={actionIndex} className="mt-2 flex items-start gap-2 rounded-[12px] bg-app-success-tint px-3 py-2 text-[13px] text-app-success">
                    <Icon name="checkCircle" size={15} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">{action.summary}</span>
                    {action.href && <Link href={action.href} className="shrink-0 font-bold text-app-success">{t("view")}</Link>}
                  </div>
                ))}
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-[13.5px] text-app-ink-soft">
              <Mascot name="peggy" mood="working" className="h-7 w-7" alt="" /> {t("peggy.working")}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {!turns.length && (
        <div className="mt-4 grid gap-2">
          {suggestions.map((text) => (
            <button key={text} type="button" disabled={busy} onClick={() => void send(text)} className="flex min-h-[44px] items-center gap-2 rounded-[14px] bg-white px-3.5 py-2 text-left text-[13.5px] font-semibold hover:shadow-sm">
              <span className="min-w-0 flex-1">{text}</span>
              <Icon name="arrow" size={14} className="shrink-0 text-app-ink-soft" />
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="start-peggy-input" className="sr-only">{t("peggy.inputLabel")}</label>
        <input
          id="start-peggy-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("peggy.placeholder")}
          maxLength={4000}
          className="h-[46px] min-w-0 flex-1 rounded-full bg-white px-4 text-[14px] outline-none placeholder:text-app-ink-faint focus:ring-2 focus:ring-app-ink/15"
        />
        <button type="submit" aria-label={t("peggy.send")} disabled={!draft.trim() || busy} className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-50">
          <Icon name="arrow" size={18} strokeWidth={2.2} />
        </button>
      </form>
      <Link href="/home/peggy" className="mt-3 self-start text-[13.5px] font-bold text-app-ink no-underline hover:underline">{t("peggy.fullChat")}</Link>
    </section>
  );
}

function RexHelper({ steps }: { steps: SetupStep[] }) {
  const t = useT("home", "common");
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const studio = (prompt: string) => `/studio?prompt=${encodeURIComponent(prompt)}`;
  const ideas = [
    ...steps.filter((step) => open(step) && step.helper?.who === "rex").map((step) => ({ label: t.dynamic(`prompt.${step.helper!.prompt}`, step.helper!.prompt), href: studio(step.helper!.prompt) })),
    { label: t("rex.logo"), href: "/studio/logo" },
    { label: t("rex.warmer"), href: studio("Rewrite my homepage banner and welcome text so it feels warm and personal.") },
  ].slice(0, 4);

  return (
    <section aria-labelledby="ask-rex-title" className="flex flex-col rounded-[22px] bg-app-peach p-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <h2 id="ask-rex-title" className="m-0 text-[17px] font-extrabold">{t("rex.title")}</h2>
          <p className="m-0 text-[13px] leading-[1.4] text-app-ink-soft">{t("rex.sub")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {ideas.map((idea) => (
          <Link key={idea.label} href={idea.href} className="flex min-h-[44px] items-center gap-2 rounded-[14px] bg-white px-3.5 py-2 text-[13.5px] font-semibold text-app-ink no-underline hover:shadow-sm">
            <span className="min-w-0 flex-1">{idea.label}</span>
            <Icon name="arrow" size={14} className="shrink-0 text-app-ink-soft" />
          </Link>
        ))}
      </div>
      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) router.push(studio(draft.trim().slice(0, 2000)));
        }}
      >
        <label htmlFor="start-rex-input" className="sr-only">{t("rex.inputLabel")}</label>
        <input
          id="start-rex-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("rex.placeholder")}
          className="h-[46px] min-w-0 flex-1 rounded-full bg-white px-4 text-[14px] outline-none placeholder:text-app-ink-faint focus:ring-2 focus:ring-app-ink/15"
        />
        <button type="submit" aria-label={t("rex.openWith")} disabled={!draft.trim()} className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-50">
          <Icon name="arrow" size={18} strokeWidth={2.2} />
        </button>
      </form>
      <PillButton tone="white" size="sm" className="mt-3 self-start" onClick={() => router.push("/studio")}>{t("rex.open")}</PillButton>
    </section>
  );
}
