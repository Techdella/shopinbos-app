"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { PLAN_CHANNELS, type PlanChannel, type PlanIdea } from "@/lib/cms/content-plan";

// The planner: pick what to plan (collections and social channels), how long and how often, and Rex fills a
// dated list of ideas. Each idea turns into a draft: Rex writes a collection item, or the caption goes to the
// social planner's drafts. The last plan is kept in this browser so it's still there after a reload.

type Collection = { id: string; name: string; itemLabel: string };
type Drafted = Record<string, { href: string } | "busy" | { error: string }>;
type Saved = { from: string; to: string; ideas: PlanIdea[]; drafted: Drafted };

const CHANNEL_LABEL: Record<PlanChannel, string> = { instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", tiktok: "TikTok", x: "X" };
const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none focus:border-app-ink";

function load(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: Saved | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode: the plan just isn't kept */
  }
}

export function PlanClient({ storeId, collections }: { storeId: string; collections: Collection[] }) {
  const t = useT("cms");
  const locale = useLocale();
  const key = `cms-plan:${storeId}`;
  const [goal, setGoal] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [perWeek, setPerWeek] = useState(2);
  // Starts on the Blog (or the first collection) and the two most-used channels.
  const [picked, setPicked] = useState<string[]>(() => (collections.find((c) => /blog/i.test(c.name)) ?? collections[0] ? [(collections.find((c) => /blog/i.test(c.name)) ?? collections[0])!.id] : []));
  const [channels, setChannels] = useState<PlanChannel[]>(["instagram", "facebook"]);
  const [plan, setPlan] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setPlan(load(key)), [key]);
  const save = (next: Saved | null) => {
    setPlan(next);
    store(key, next);
  };

  const names = useMemo(() => new Map(collections.map((c) => [c.id, c.name])), [collections]);
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/cms/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, weeks, perWeek, collectionIds: picked, channels }) });
      const json = (await res.json().catch(() => null)) as { data?: { from: string; to: string; ideas: PlanIdea[] }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? t("rex.failed"));
      save({ ...json.data, drafted: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rex.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function draft(idea: PlanIdea) {
    if (!plan) return;
    const mark = (value: Drafted[string]) => setPlan((current) => {
      if (!current) return current;
      const next = { ...current, drafted: { ...current.drafted, [idea.id]: value } };
      if (value !== "busy") store(key, next);
      return next;
    });
    mark("busy");
    try {
      if (idea.kind === "cms") {
        const res = await fetch(`/api/app/cms/collections/${idea.collectionId}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: idea.brief, title: idea.title }) });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data?.href) throw new Error(json?.error?.message ?? t("rex.failed"));
        mark({ href: json.data.href });
      } else {
        const res = await fetch("/api/app/social-posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: idea.caption || idea.brief, channels: idea.channel ? [idea.channel] : [], when: "draft" }) });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data?.id) throw new Error(json?.error?.message ?? t("plan.saveFailed"));
        mark({ href: `/home/marketing/social/${json.data.id}` });
      }
    } catch (e) {
      mark({ error: e instanceof Error ? e.message : t("rex.failed") });
    }
  }

  const remove = (id: string) => plan && save({ ...plan, ideas: plan.ideas.filter((idea) => idea.id !== id) });

  const weeksOf = useMemo(() => {
    if (!plan) return [];
    const start = new Date(`${plan.from}T00:00:00Z`).getTime();
    const groups = new Map<number, PlanIdea[]>();
    for (const idea of plan.ideas) {
      const week = Math.floor((new Date(`${idea.date}T00:00:00Z`).getTime() - start) / (7 * 86400000));
      groups.set(week, [...(groups.get(week) ?? []), idea]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [plan]);

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-4 sm:p-6">
        <div>
          <label htmlFor="plan-goal" className="mb-1.5 block text-[13.5px] font-bold">{t("plan.goal")} <span className="block text-[12.5px] font-normal text-app-ink-soft">{t("plan.goalHelp")}</span></label>
          <textarea id="plan-goal" rows={2} maxLength={600} className={cx(input, "py-2.5")} value={goal} placeholder={t("plan.goalPh")} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1.5 text-[13.5px] font-bold">{t("plan.website")}</legend>
            {collections.length ? (
              <div className="flex flex-wrap gap-2">
                {collections.map((c) => (
                  <label key={c.id} className={cx("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-bold", picked.includes(c.id) ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                    <input type="checkbox" className="sr-only" checked={picked.includes(c.id)} onChange={() => setPicked(toggle(picked, c.id))} /> {c.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[13px] text-app-ink-soft">{t("plan.noCollections")} <Link href="/home/cms" className="font-bold underline">{t("col.allContent")}</Link></p>
            )}
          </fieldset>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1.5 text-[13.5px] font-bold">{t("plan.social")}</legend>
            <div className="flex flex-wrap gap-2">
              {PLAN_CHANNELS.map((channel) => (
                <label key={channel} className={cx("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-bold", channels.includes(channel) ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                  <input type="checkbox" className="sr-only" checked={channels.includes(channel)} onChange={() => setChannels(toggle(channels, channel))} /> {CHANNEL_LABEL[channel]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="plan-weeks" className="mb-1.5 block text-[13.5px] font-bold">{t("plan.howLong")}</label>
            <select id="plan-weeks" className={cx(input, "w-auto")} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[1, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{t("plan.weeks", { count: n })}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="plan-often" className="mb-1.5 block text-[13.5px] font-bold">{t("plan.howOften")}</label>
            <select id="plan-often" className={cx(input, "w-auto")} value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))}>
              {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{t("plan.perWeek", { count: n })}</option>)}
            </select>
          </div>
          <PillButton tone="accent" size="md" busy={busy} disabled={!picked.length && !channels.length} onClick={() => void generate()} className="ml-auto">
            <Icon name="sparkle" size={16} /> {plan ? t("plan.again") : t("plan.make")}
          </PillButton>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </section>

      {plan && (
        <section className="grid gap-4" aria-labelledby="plan-ideas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="plan-ideas" className="m-0 text-[18px] font-extrabold">{t("plan.ideas", { from: formatDate(`${plan.from}T12:00:00Z`, locale, { dateStyle: "medium" }), to: formatDate(`${plan.to}T12:00:00Z`, locale, { dateStyle: "medium" }) })}</h2>
            <button type="button" className="text-[13px] font-bold text-app-ink-soft underline" onClick={() => save(null)}>{t("plan.clear")}</button>
          </div>
          <p className="-mt-2 mb-0 text-[13px] text-app-ink-soft">{t("plan.howTo")}</p>
          {weeksOf.map(([week, ideas]) => (
            <div key={week} className="grid gap-2">
              <h3 className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">{t("plan.week", { n: week + 1 })}</h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {ideas.map((idea) => {
                  const state = plan.drafted[idea.id];
                  return (
                    <li key={idea.id} className="grid gap-2 rounded-[18px] border border-app-line bg-white p-4 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-start">
                      <div className="text-[13px] font-bold text-app-ink-soft">{formatDate(`${idea.date}T12:00:00Z`, locale, { weekday: "short", day: "numeric", month: "short" })}</div>
                      <div className="min-w-0">
                        <span className={cx("mb-1 inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-bold", idea.kind === "cms" ? "bg-app-canvas text-app-ink" : "bg-app-ink text-white")}>
                          {idea.kind === "cms" ? names.get(idea.collectionId ?? "") ?? t("plan.website") : CHANNEL_LABEL[idea.channel ?? "instagram"]}
                        </span>
                        <p className="m-0 text-[15px] font-extrabold leading-snug">{idea.title}</p>
                        <p className="m-0 mt-1 text-[13.5px] leading-relaxed text-app-ink-soft">{idea.brief}</p>
                        {idea.kind === "social" && idea.caption && (
                          <details className="mt-2 text-[13.5px]">
                            <summary className="cursor-pointer font-bold">{t("plan.caption")}</summary>
                            <p className="m-0 mt-1 whitespace-pre-line rounded-[12px] bg-app-canvas p-3">{idea.caption}</p>
                          </details>
                        )}
                        {state && typeof state === "object" && "error" in state && <p className="m-0 mt-1.5 text-[13px] text-app-danger" role="alert">{state.error}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {state && typeof state === "object" && "href" in state ? (
                          <Link href={state.href} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white no-underline"><Icon name="check" size={14} /> {t("plan.openDraft")}</Link>
                        ) : (
                          <PillButton tone="ink" size="sm" busy={state === "busy"} onClick={() => void draft(idea)}>{idea.kind === "cms" ? t("plan.writeDraft") : t("plan.saveSocial")}</PillButton>
                        )}
                        <button type="button" aria-label={t("plan.remove", { title: idea.title })} onClick={() => remove(idea.id)} className="grid h-10 w-10 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas"><Icon name="x" size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
