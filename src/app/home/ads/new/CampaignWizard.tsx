"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, Spinner, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import { BuyCreditsButton, isCreditsError } from "@/components/credits/CreditsBadge";
import { naira } from "@shared/onboarding";
import {
  AD_COUNTRIES,
  AD_CTA_LABEL,
  AD_CTAS,
  AD_OBJECTIVE_INFO,
  AD_OBJECTIVES,
  AD_SETUP_FEES,
  MIN_DAILY_BUDGET,
  NG_STATES,
  campaignTotal,
  type AdAudience,
  type AdCreative,
  type AdObjective,
} from "@shared/ad-campaigns";
import { MetaConnectCard, type MetaStatus } from "../MetaConnectCard";

export interface WizardProduct {
  id: string;
  name: string;
  price: number;
  image: string | null;
}

export interface WizardVideo {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  productId: string | null;
}

type Mode = "meta" | "managed_meta" | "managed_tiktok";
const STEPS = ["how", "products", "audience", "budget", "ads", "review"] as const;
type Step = (typeof STEPS)[number];

const card = "rounded-[22px] border border-app-line bg-white p-5";
const chip = "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold";
const today = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => null)) as { data?: unknown; error?: { code?: string; message?: string } } | null;
  if (!response.ok) throw Object.assign(new Error(json?.error?.message ?? "Something went wrong. Try again."), { code: json?.error?.code });
  return json?.data;
}

/**
 * Start a campaign: how it runs (your own Meta ad account, or the Shopinbos team on Meta or TikTok), the
 * products, goal and audience, budget and dates, the ads (photo or video per product, words by Peggy), then
 * launch or send the request and pay the setup fee.
 */
export function CampaignWizard({
  products,
  videos,
  meta,
  initialVideoId,
  initialProductIds,
  contact,
  hasWhatsapp,
}: {
  products: WizardProduct[];
  videos: WizardVideo[];
  meta: MetaStatus;
  initialVideoId: string | null;
  initialProductIds: string[];
  contact: { name: string; phone: string; email: string; businessName: string; website: string };
  hasWhatsapp: boolean;
}) {
  const t = useT("ads");
  const router = useRouter();
  const media = useMediaLibrary();
  const startVideo = videos.find((video) => video.id === initialVideoId) ?? null;
  const [step, setStep] = useState<Step>("how");
  const [mode, setMode] = useState<Mode>(meta.configured && meta.status === "connected" ? "meta" : "managed_meta");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [productIds, setProductIds] = useState<string[]>(() => {
    const start = [...initialProductIds, ...(startVideo?.productId ? [startVideo.productId] : [])].filter((id) => products.some((product) => product.id === id));
    return [...new Set(start)];
  });
  const [objective, setObjective] = useState<AdObjective>("traffic");
  const [audience, setAudience] = useState<AdAudience>({ countries: ["NG"], states: [], ageMin: 18, ageMax: 55, gender: "all", interests: [] });
  const [interest, setInterest] = useState("");
  const [dailyBudget, setDailyBudget] = useState(5000);
  const [startAt, setStartAt] = useState(today());
  const [days, setDays] = useState(7);
  const [creatives, setCreatives] = useState<AdCreative[]>(() =>
    startVideo ? [{ productId: startVideo.productId, kind: "video", mediaUrl: startVideo.videoUrl, thumbUrl: startVideo.posterUrl, videoProjectId: startVideo.id, headline: startVideo.title.slice(0, 80), primaryText: "", cta: "SHOP_NOW" }] : [],
  );
  const [details, setDetails] = useState({ ...contact, handle: "", pageUrl: "", adAccountId: "", goals: "", audienceNotes: "", notes: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; credits?: boolean } | null>(null);
  const [pickVideoFor, setPickVideoFor] = useState<number | null>(null);

  const chosen = useMemo(() => products.filter((product) => productIds.includes(product.id)), [products, productIds]);
  const currency = mode === "meta" ? meta.currency : "NGN";
  const managedPlatform = mode === "managed_tiktok" ? "tiktok" : "meta";
  const fee = mode === "meta" ? 0 : AD_SETUP_FEES[managedPlatform];
  const money = (value: number) => (currency === "NGN" ? naira(value) : `${value.toLocaleString()} ${currency}`);

  // Every chosen product gets an ad with its photo; ads for products taken out go too (videos stay).
  useEffect(() => {
    setCreatives((current) => {
      const kept = current.filter((creative) => creative.kind === "video" || (creative.productId && productIds.includes(creative.productId)));
      const missing = chosen.filter((product) => product.image && !kept.some((creative) => creative.productId === product.id));
      return [
        ...kept,
        ...missing.map((product): AdCreative => ({ productId: product.id, kind: "image", mediaUrl: product.image!, thumbUrl: null, videoProjectId: null, headline: `${product.name} · ${naira(product.price)}`.slice(0, 80), primaryText: "", cta: objective === "whatsapp" ? "CONTACT_US" : "SHOP_NOW" })),
      ];
    });
  }, [chosen, productIds, objective]);

  useEffect(() => {
    if (!name && chosen.length) setName(chosen.length === 1 ? t("c.nameOne", { product: chosen[0].name }) : t("c.nameMany", { count: chosen.length }));
  }, [chosen, name, t]);

  const index = STEPS.indexOf(step);
  const canNext =
    step === "how" ? mode !== "meta" || meta.status === "connected" :
    step === "products" ? productIds.length > 0 :
    step === "audience" ? audience.countries.length > 0 && audience.ageMin <= audience.ageMax :
    step === "budget" ? dailyBudget >= (MIN_DAILY_BUDGET[currency] ?? 1) && days >= 1 :
    step === "ads" ? creatives.length > 0 && creatives.every((creative) => creative.headline.trim() && creative.primaryText.trim()) :
    true;

  function update(i: number, patch: Partial<AdCreative>) {
    setCreatives((current) => current.map((creative, n) => (n === i ? { ...creative, ...patch } : creative)));
  }

  async function writeWithPeggy() {
    setBusy("copy");
    setError(null);
    try {
      const copy = (await postJson("/api/app/ads/copy", { productIds, objective })) as Array<{ productId: string; headline: string; primaryText: string }>;
      setCreatives((current) =>
        current.map((creative) => {
          const match = copy.find((item) => item.productId === creative.productId) ?? (creative.kind === "video" ? copy[0] : null);
          return match ? { ...creative, headline: match.headline, primaryText: match.primaryText } : creative;
        }),
      );
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t("c.err.copy"), credits: isCreditsError((err as { code?: string }).code) });
    } finally {
      setBusy(null);
    }
  }

  async function changeMedia(i: number) {
    const [asset] = await media.open({ accept: "any", title: t("c.pickMedia") });
    if (!asset) return;
    update(i, asset.kind === "video" ? { kind: "video", mediaUrl: asset.url, thumbUrl: null, videoProjectId: null } : { kind: "image", mediaUrl: asset.url, thumbUrl: null, videoProjectId: null });
  }

  function addVideo(video: WizardVideo) {
    const productId = video.productId && productIds.includes(video.productId) ? video.productId : productIds[0] ?? null;
    const base = creatives.find((creative) => creative.productId === productId);
    setCreatives((current) => [...current, { productId, kind: "video", mediaUrl: video.videoUrl, thumbUrl: video.posterUrl, videoProjectId: video.id, headline: base?.headline ?? video.title.slice(0, 80), primaryText: base?.primaryText ?? "", cta: base?.cta ?? "SHOP_NOW" }]);
    setPickVideoFor(null);
  }

  function campaignBody() {
    return {
      name: name.trim() || t("c.nameMany", { count: productIds.length }),
      mode: mode === "meta" ? "meta" : "managed",
      platform: managedPlatform,
      objective,
      productIds,
      audience,
      creatives,
      dailyBudget,
      currency,
      startAt,
      days,
    };
  }

  async function saveDraft() {
    const saved = (await postJson("/api/app/ads/campaigns", campaignBody())) as { id: string };
    return saved.id;
  }

  async function finish(launch: boolean) {
    setBusy(launch ? "launch" : "draft");
    setError(null);
    try {
      const id = await saveDraft();
      if (mode === "meta" && launch) await postJson(`/api/app/ads/campaigns/${id}`, { action: "launch" });
      if (mode !== "meta") {
        const request = (await postJson("/api/app/ads/requests", {
          platform: managedPlatform,
          campaignId: id,
          contactName: details.name,
          contactPhone: details.phone,
          contactEmail: details.email || null,
          businessName: details.businessName,
          handle: details.handle || null,
          pageUrl: details.pageUrl || null,
          website: details.website || null,
          adAccountId: details.adAccountId || null,
          dailyBudget,
          days,
          goals: [AD_OBJECTIVE_INFO[objective].label, details.goals].filter(Boolean).join(". "),
          audience: [describeAudience(audience), details.audienceNotes].filter(Boolean).join(". "),
          notes: details.notes || null,
        })) as { authorizationUrl: string };
        window.location.assign(request.authorizationUrl);
        return;
      }
      router.push(`/home/ads?campaign=${id}&done=${launch ? "launched" : "draft"}`);
      router.refresh();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t("c.err.save") });
      setBusy(null);
    }
  }

  const visible = products.filter((product) => !query.trim() || product.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="grid gap-4">
      {media.dialog}
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t("c.steps")}>
        {STEPS.map((key, n) => (
          <li key={key}>
            <button
              type="button"
              disabled={n > index && !canNext}
              onClick={() => n <= index && setStep(key)}
              aria-current={step === key ? "step" : undefined}
              className={cx("inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold", step === key ? "bg-app-ink text-white" : n < index ? "bg-app-mint text-app-ink" : "bg-white text-app-ink-soft")}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-[11px]">{n < index ? "✓" : n + 1}</span>
              {t(`c.step.${key}`)}
            </button>
          </li>
        ))}
      </ol>

      {step === "how" ? (
        <section className={card}>
          <h2 className="m-0 text-[18px] font-extrabold">{t("c.how")}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={t("c.how")}>
            {([
              ["meta", "facebook", t("c.mode.meta"), t("c.mode.metaHint")],
              ["managed_meta", "users", t("c.mode.managedMeta"), t("c.mode.managedMetaHint", { fee: naira(AD_SETUP_FEES.meta) })],
              ["managed_tiktok", "tiktok", t("c.mode.tiktok"), t("c.mode.tiktokHint", { fee: naira(AD_SETUP_FEES.tiktok) })],
            ] as const).map(([value, icon, title, hint]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} className={cx("flex flex-col items-start gap-2 rounded-[18px] border-2 p-4 text-left", mode === value ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}>
                <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-app-peach"><Icon name={icon} size={18} /></span>
                <span className="text-[15px] font-extrabold">{title}</span>
                <span className="text-[13px] leading-[1.45] text-app-ink-soft">{hint}</span>
              </button>
            ))}
          </div>
          {mode === "meta" ? <div className="mt-4"><MetaConnectCard status={meta} compact /></div> : (
            <p className="m-0 mt-4 rounded-[14px] bg-app-canvas px-4 py-3 text-[13.5px] leading-[1.5]">{t("c.managedNote", { fee: naira(fee) })}</p>
          )}
        </section>
      ) : null}

      {step === "products" ? (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[18px] font-extrabold">{t("c.products")}</h2>
            <span className="text-[13px] font-bold text-app-ink-soft">{t("c.chosen", { count: productIds.length })}</span>
          </div>
          <TextInput className="mt-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("c.search")} aria-label={t("c.search")} />
          {products.length === 0 ? <p className="m-0 mt-4 text-[14px] text-app-ink-soft">{t("noProducts")}</p> : null}
          <ul className="m-0 mt-3 grid max-h-[480px] list-none grid-cols-2 gap-2 overflow-y-auto p-0 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((product) => {
              const on = productIds.includes(product.id);
              return (
                <li key={product.id}>
                  <button type="button" aria-pressed={on} onClick={() => setProductIds((current) => (on ? current.filter((id) => id !== product.id) : [...current, product.id].slice(0, 20)))} className={cx("relative flex w-full flex-col overflow-hidden rounded-[16px] border-2 text-left", on ? "border-app-ink" : "border-app-line")}>
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    ) : <span className="aspect-square w-full bg-app-canvas" />}
                    <span className="block truncate px-2.5 pt-2 text-[13px] font-bold">{product.name}</span>
                    <span className="block px-2.5 pb-2 text-[12.5px] text-app-ink-soft">{naira(product.price)}</span>
                    <span className={cx("absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 border-white", on ? "bg-app-ink text-white" : "bg-white/80")}>{on ? <Icon name="check" size={14} /> : null}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {step === "audience" ? (
        <section className={cx(card, "grid gap-5")}>
          <div>
            <h2 className="m-0 text-[18px] font-extrabold">{t("c.goal")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("c.goal")}>
              {AD_OBJECTIVES.map((value) => {
                const disabled = value === "whatsapp" && !hasWhatsapp;
                return (
                  <button key={value} type="button" role="radio" aria-checked={objective === value} disabled={disabled} onClick={() => setObjective(value)} className={cx("rounded-[16px] border-2 p-3 text-left disabled:opacity-50", objective === value ? "border-app-ink" : "border-app-line")}>
                    <span className="block text-[14px] font-extrabold">{t.dynamic(`c.obj.${value}`, AD_OBJECTIVE_INFO[value].label)}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">{disabled ? t("dest.addWhatsApp") : t.dynamic(`c.obj.${value}Hint`, AD_OBJECTIVE_INFO[value].hint)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="m-0 text-[15px] font-extrabold">{t("c.where")}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {AD_COUNTRIES.map((country) => {
                const on = audience.countries.includes(country.code);
                return (
                  <button key={country.code} type="button" aria-pressed={on} onClick={() => setAudience((a) => ({ ...a, countries: on ? a.countries.filter((code) => code !== country.code) : [...a.countries, country.code] }))} className={cx(chip, on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                    {country.name}
                  </button>
                );
              })}
            </div>
            {audience.countries.includes("NG") ? (
              <details className="mt-3 rounded-[14px] bg-app-canvas p-3" open={audience.states.length > 0}>
                <summary className="cursor-pointer text-[13.5px] font-bold">{audience.states.length ? t("c.statesChosen", { count: audience.states.length }) : t("c.allNigeria")}</summary>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {NG_STATES.map((state) => {
                    const on = audience.states.includes(state);
                    return (
                      <button key={state} type="button" aria-pressed={on} onClick={() => setAudience((a) => ({ ...a, states: on ? a.states.filter((item) => item !== state) : [...a.states, state] }))} className={cx("min-h-[34px] rounded-full border px-3 text-[12.5px] font-bold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                        {state === "Federal Capital Territory" ? "Abuja (FCT)" : state}
                      </button>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="m-0 text-[15px] font-extrabold">{t("c.age")}</h3>
              <div className="mt-2 flex items-center gap-2">
                <TextInput type="number" min={18} max={65} value={audience.ageMin} onChange={(event) => setAudience((a) => ({ ...a, ageMin: Math.max(18, Math.min(65, Number(event.target.value) || 18)) }))} aria-label={t("c.ageFrom")} className="w-24" />
                <span className="text-[14px]">{t("c.to")}</span>
                <TextInput type="number" min={18} max={65} value={audience.ageMax} onChange={(event) => setAudience((a) => ({ ...a, ageMax: Math.max(18, Math.min(65, Number(event.target.value) || 65)) }))} aria-label={t("c.ageTo")} className="w-24" />
              </div>
            </div>
            <div>
              <h3 className="m-0 text-[15px] font-extrabold">{t("c.gender")}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["all", "women", "men"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={audience.gender === value} onClick={() => setAudience((a) => ({ ...a, gender: value }))} className={cx(chip, audience.gender === value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                    {t(`c.gender.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <h3 className="m-0 text-[15px] font-extrabold">{t("c.interests")}</h3>
            <p className="m-0 mt-1 text-[12.5px] text-app-ink-soft">{t("c.interestsHint")}</p>
            <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); const word = interest.trim(); if (word && !audience.interests.includes(word)) setAudience((a) => ({ ...a, interests: [...a.interests, word].slice(0, 10) })); setInterest(""); }}>
              <TextInput value={interest} onChange={(event) => setInterest(event.target.value)} placeholder={t("c.interestPh")} aria-label={t("c.interests")} className="flex-1" />
              <PillButton type="submit" size="md" tone="white">{t("c.add")}</PillButton>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {audience.interests.map((word) => (
                <button key={word} type="button" onClick={() => setAudience((a) => ({ ...a, interests: a.interests.filter((item) => item !== word) }))} className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-app-canvas px-3 text-[12.5px] font-bold" aria-label={t("c.removeInterest", { word })}>
                  {word} <Icon name="x" size={12} />
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {step === "budget" ? (
        <section className={cx(card, "grid gap-4")}>
          <h2 className="m-0 text-[18px] font-extrabold">{t("c.budget")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="c-budget">{t("c.daily", { currency })}</FieldLabel>
              <TextInput id="c-budget" inputMode="numeric" value={String(dailyBudget)} onChange={(event) => setDailyBudget(Number(event.target.value.replace(/[^\d.]/g, "")) || 0)} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(currency === "NGN" ? [2000, 5000, 10000, 20000] : [5, 10, 20, 50]).map((value) => (
                  <button key={value} type="button" onClick={() => setDailyBudget(value)} className={cx("min-h-[32px] rounded-full border px-3 text-[12.5px] font-bold", dailyBudget === value ? "border-app-ink bg-app-ink text-white" : "border-app-line")}>{money(value)}</button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="c-start">{t("c.startDate")}</FieldLabel>
              <TextInput id="c-start" type="date" min={today()} value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="c-days">{t("c.daysLabel")}</FieldLabel>
              <TextInput id="c-days" type="number" min={1} max={90} value={days} onChange={(event) => setDays(Math.max(1, Math.min(90, Number(event.target.value) || 1)))} />
            </div>
          </div>
          <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px]">
            {t("c.totalSpend", { total: money(campaignTotal(dailyBudget, days)), platform: mode === "managed_tiktok" ? "TikTok" : "Meta" })}
            {fee ? ` ${t("c.plusFee", { fee: naira(fee) })}` : ""}
          </p>
          {dailyBudget < (MIN_DAILY_BUDGET[currency] ?? 1) ? <Notice>{t("c.minBudget", { amount: money(MIN_DAILY_BUDGET[currency] ?? 1) })}</Notice> : null}
        </section>
      ) : null}

      {step === "ads" ? (
        <section className={cx(card, "grid gap-4")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[18px] font-extrabold">{t("c.ads")}</h2>
            <div className="flex flex-wrap gap-2">
              <PillButton type="button" size="md" busy={busy === "copy"} onClick={() => void writeWithPeggy()}><Icon name="sparkle" size={14} /> {t("c.writePeggy")}</PillButton>
              {videos.length ? (
                <PillButton type="button" size="md" tone="white" onClick={() => setPickVideoFor(pickVideoFor === null ? 0 : null)}><Icon name="play" size={14} /> {t("c.addVideo")}</PillButton>
              ) : (
                <Link href="/home/video/studio?purpose=ad" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-app-line px-4 text-[14px] font-bold text-app-ink no-underline"><Icon name="play" size={14} /> {t("c.makeVideo")}</Link>
              )}
            </div>
          </div>
          {pickVideoFor !== null ? (
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-5">
              {videos.map((video) => (
                <li key={video.id}>
                  <button type="button" onClick={() => addVideo(video)} className="w-full overflow-hidden rounded-[12px] border border-app-line text-left">
                    {video.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.posterUrl} alt="" className="aspect-[9/16] w-full object-cover" />
                    ) : <video src={video.videoUrl} muted className="aspect-[9/16] w-full object-cover" />}
                    <span className="block truncate px-2 py-1 text-[12px] font-bold">{video.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {creatives.map((creative, i) => {
            const product = products.find((item) => item.id === creative.productId);
            return (
              <article key={`${creative.mediaUrl}-${i}`} className="grid gap-3 rounded-[18px] border border-app-line p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                <div className="grid content-start gap-2">
                  <div className="relative overflow-hidden rounded-[12px] bg-app-canvas">
                    {creative.kind === "video" ? (
                      <video src={creative.mediaUrl} poster={creative.thumbUrl ?? undefined} muted playsInline controls className="aspect-[9/16] w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={creative.mediaUrl} alt="" className="aspect-square w-full object-cover" />
                    )}
                  </div>
                  <button type="button" onClick={() => void changeMedia(i)} className="rounded-full border border-app-line px-3 py-1.5 text-[12.5px] font-bold">{t("c.change")}</button>
                </div>
                <div className="grid content-start gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-app-ink-soft">{creative.kind === "video" ? t("c.videoAd") : t("c.photoAd")}{product ? ` · ${product.name}` : ""}</span>
                    <button type="button" onClick={() => setCreatives((current) => current.filter((_, n) => n !== i))} className="text-[12.5px] font-bold text-app-danger" disabled={creatives.length === 1}>{t("c.removeAd")}</button>
                  </div>
                  <div>
                    <FieldLabel htmlFor={`h-${i}`}>{t("headline")}</FieldLabel>
                    <TextInput id={`h-${i}`} value={creative.headline} maxLength={80} onChange={(event) => update(i, { headline: event.target.value })} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`p-${i}`}>{t("adText")}</FieldLabel>
                    <textarea id={`p-${i}`} rows={3} maxLength={500} value={creative.primaryText} onChange={(event) => update(i, { primaryText: event.target.value })} placeholder={t("c.textPh")} className="w-full rounded-[16px] border border-app-line px-4 py-3 text-[14.5px]" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <FieldLabel htmlFor={`cta-${i}`}>{t("c.button")}</FieldLabel>
                    <select id={`cta-${i}`} value={creative.cta} onChange={(event) => update(i, { cta: event.target.value as AdCreative["cta"] })} className="h-10 rounded-full border border-app-line bg-white px-3 text-[13.5px]">
                      {AD_CTAS.map((cta) => <option key={cta} value={cta}>{t.dynamic(`c.cta.${cta}`, AD_CTA_LABEL[cta])}</option>)}
                    </select>
                    <select value={creative.productId ?? ""} onChange={(event) => update(i, { productId: event.target.value || null })} aria-label={t("c.linksTo")} className="h-10 max-w-[220px] rounded-full border border-app-line bg-white px-3 text-[13.5px]">
                      {chosen.map((item) => <option key={item.id} value={item.id}>{t("c.opens", { product: item.name })}</option>)}
                    </select>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {step === "review" ? (
        <section className={cx(card, "grid gap-4")}>
          <h2 className="m-0 text-[18px] font-extrabold">{t("c.review")}</h2>
          <div>
            <FieldLabel htmlFor="c-name">{t("c.name")}</FieldLabel>
            <TextInput id="c-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
          <dl className="m-0 grid gap-2 text-[14px] sm:grid-cols-2">
            {[
              [t("c.step.how"), mode === "meta" ? t("c.mode.meta") : mode === "managed_tiktok" ? t("c.mode.tiktok") : t("c.mode.managedMeta")],
              [t("c.step.products"), chosen.map((product) => product.name).join(", ")],
              [t("c.goal"), t.dynamic(`c.obj.${objective}`, AD_OBJECTIVE_INFO[objective].label)],
              [t("c.where"), describeAudience(audience)],
              [t("c.budget"), `${money(dailyBudget)} × ${t("days", { count: days })} = ${money(campaignTotal(dailyBudget, days))}`],
              [t("c.ads"), t("c.adsCount", { count: creatives.length })],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] bg-app-canvas px-3 py-2">
                <dt className="text-[12px] font-bold text-app-ink-soft">{label}</dt>
                <dd className="m-0 font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          {mode === "meta" ? (
            <>
              <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{t("c.metaBilling", { account: meta.accountName ?? "" })}</p>
              <div className="flex flex-wrap gap-2">
                <PillButton type="button" busy={busy === "launch"} disabled={busy !== null || meta.status !== "connected"} onClick={() => void finish(true)}><Icon name="rocket" size={15} /> {t("c.launch")}</PillButton>
                <PillButton type="button" tone="white" busy={busy === "draft"} disabled={busy !== null} onClick={() => void finish(false)}>{t("c.saveDraft")}</PillButton>
              </div>
              {busy === "launch" ? <p className="m-0 text-[13px] text-app-ink-soft"><Spinner className="mr-1.5 inline h-4 w-4" /> {t("c.launching")}</p> : null}
            </>
          ) : (
            <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void finish(true); }}>
              <h3 className="m-0 text-[15px] font-extrabold">{t("c.yourDetails")}</h3>
              <p className="m-0 text-[13px] text-app-ink-soft">{mode === "managed_tiktok" ? t("c.tiktokNeeds") : t("c.metaNeeds")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["name", t("c.f.name"), true],
                  ["phone", t("c.f.phone"), true],
                  ["email", t("c.f.email"), false],
                  ["businessName", t("c.f.business"), true],
                  ["handle", mode === "managed_tiktok" ? t("c.f.tiktok") : t("c.f.instagram"), mode === "managed_tiktok"],
                  ["pageUrl", mode === "managed_tiktok" ? t("c.f.tiktokProfile") : t("c.f.facebookPage"), false],
                  ["website", t("c.f.website"), false],
                  ["adAccountId", t("c.f.adAccount"), false],
                ] as const).map(([key, label, required]) => (
                  <div key={key}>
                    <FieldLabel htmlFor={`d-${key}`}>{label}{required ? " *" : ""}</FieldLabel>
                    <TextInput id={`d-${key}`} required={required} value={details[key]} onChange={(event) => setDetails((d) => ({ ...d, [key]: event.target.value }))} />
                  </div>
                ))}
              </div>
              <div>
                <FieldLabel htmlFor="d-goals">{t("c.f.goals")}</FieldLabel>
                <textarea id="d-goals" rows={2} value={details.goals} onChange={(event) => setDetails((d) => ({ ...d, goals: event.target.value }))} className="w-full rounded-[16px] border border-app-line px-4 py-3 text-[14.5px]" />
              </div>
              <div>
                <FieldLabel htmlFor="d-notes">{t("c.f.notes")}</FieldLabel>
                <textarea id="d-notes" rows={2} value={details.notes} onChange={(event) => setDetails((d) => ({ ...d, notes: event.target.value }))} className="w-full rounded-[16px] border border-app-line px-4 py-3 text-[14.5px]" />
              </div>
              <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13.5px] leading-[1.5]">{t("c.feeNote", { fee: naira(fee), platform: mode === "managed_tiktok" ? "TikTok" : "Meta" })}</p>
              <PillButton type="submit" busy={busy === "launch"} disabled={busy !== null} className="w-fit">{t("c.payFee", { fee: naira(fee) })}</PillButton>
            </form>
          )}
        </section>
      ) : null}

      {error ? (
        <div className="grid gap-2">
          <Notice>{error.text}</Notice>
          {error.credits ? <BuyCreditsButton /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillButton type="button" tone="white" disabled={index === 0 || busy !== null} onClick={() => setStep(STEPS[Math.max(0, index - 1)])}>{t("c.back")}</PillButton>
        {step !== "review" ? (
          <PillButton type="button" disabled={!canNext} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)])}>{t("c.next")}</PillButton>
        ) : null}
      </div>
    </div>
  );
}

function describeAudience(audience: AdAudience) {
  const where = audience.states.length ? audience.states.map((state) => (state === "Federal Capital Territory" ? "Abuja" : state)).join(", ") : audience.countries.map((code) => AD_COUNTRIES.find((c) => c.code === code)?.name ?? code).join(", ");
  const who = audience.gender === "all" ? "everyone" : audience.gender;
  return `${where} · ${who} ${audience.ageMin}-${audience.ageMax}${audience.interests.length ? ` · into ${audience.interests.join(", ")}` : ""}`;
}
