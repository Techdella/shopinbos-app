"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, TextInput } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { naira } from "@shared/onboarding";
import { AD_BUDGETS, AD_DESTINATIONS, AD_PLATFORMS, STOP_RULE_DAYS, type AdAdvice, type AdDestination, type AdPlatform } from "@shared/ads";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

interface Product {
  id: string;
  name: string;
  price: number;
  image: string | null;
}

interface Ad {
  id: string;
  code: string;
  platform: string;
  destination: string;
  headline: string;
  primaryText: string;
  imageUrl: string | null;
  productName: string | null;
  dailyBudget: number;
  days: number;
  status: string;
  link: string;
  day: number;
  planned: number;
  stats: { spend: number; clicks: number; orders: number; revenue: number };
  costPerOrder: number | null;
  advice: AdAdvice;
}

const card = "rounded-[22px] border border-app-line bg-white p-5";

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json?.data;
}

const STATUS_LABEL: Record<string, string> = { draft: "Not started", running: "Running", paused: "Paused", ended: "Ended" };
const PLATFORM_HELP: Record<string, string> = {
  instagram: "In Instagram, open the post or reel → Boost → Destination: Your website → paste the link.",
  facebook: "In Facebook, open the post → Boost post → Button: Learn more or Send WhatsApp message → paste the link.",
  tiktok: "In TikTok, open the video → Promote → More website visits → paste the link.",
  whatsapp_status: "Post the photo on your WhatsApp status with the text and the link. No spend needed.",
};
const DESTINATION_KEYS = { whatsapp: "dest.whatsapp", store: "dest.store" } as const;

function NewAd({ products, hasWhatsapp, onCreated, image, initialProductId }: { products: Product[]; hasWhatsapp: boolean; onCreated: () => void; image: string | null; initialProductId?: string }) {
  const t = useT("ads");
  const [productId, setProductId] = useState(products.find((product) => product.id === initialProductId)?.id ?? products[0]?.id ?? "");
  const [useImage, setUseImage] = useState(Boolean(image));
  const [platform, setPlatform] = useState<AdPlatform>("instagram");
  const [destination, setDestination] = useState<AdDestination>(hasWhatsapp ? "whatsapp" : "store");
  const [budget, setBudget] = useState<number>(AD_BUDGETS[0]);
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const free = platform === "whatsapp_status";

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await send("/api/app/ads", "POST", { productId, platform, destination, dailyBudget: free ? 500 : budget, days, ...(image && useImage ? { imageUrl: image } : {}) });
      onCreated();
    } catch (createError) {
      setError(createError instanceof Error ? friendlyError(createError) : t("err.write"));
    } finally {
      setBusy(false);
    }
  }

  if (!products.length) {
    return <section className={card}><p className="m-0 text-[14.5px] text-app-ink-soft">{t("noProducts")}</p></section>;
  }

  return (
    <section className={card}>
      <h2 className="m-0 text-[17px] font-extrabold">{t("make")}</h2>
      <div className="mt-3 grid gap-4">
        {image ? (
          <label className="flex cursor-pointer items-center gap-3 rounded-[16px] bg-app-canvas p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-[12px] object-cover" />
            <span className="min-w-0 flex-1 text-[14px] font-bold">{t("useRexPicture")}</span>
            <input type="checkbox" checked={useImage} onChange={(event) => setUseImage(event.target.checked)} className="h-5 w-5 accent-[#16141F]" />
          </label>
        ) : null}
        <div>
          <FieldLabel htmlFor="ad-product">{t("product")}</FieldLabel>
          <select id="ad-product" value={productId} onChange={(event) => setProductId(event.target.value)} className="h-[52px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px]">
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {naira(product.price)}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-2 text-[14px] font-bold">{t("where")}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("whereRuns")}>
            {AD_PLATFORMS.map((option) => (
              <button key={option.key} type="button" role="radio" aria-checked={platform === option.key} onClick={() => setPlatform(option.key)} className={cx("min-h-[40px] rounded-full border px-4 text-[14px] font-bold", platform === option.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                {option.key === "whatsapp_status" ? t("platform.whatsappStatus") : option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[14px] font-bold">{t("buyersGo")}</div>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("whereBuyersGo")}>
            {AD_DESTINATIONS.map((option) => {
              const disabled = option.key === "whatsapp" && !hasWhatsapp;
              return (
                <button key={option.key} type="button" role="radio" aria-checked={destination === option.key} disabled={disabled} onClick={() => setDestination(option.key)} className={cx("rounded-[16px] border-2 p-3 text-left disabled:opacity-50", destination === option.key ? "border-app-ink" : "border-app-line")}>
                  <span className="block text-[14px] font-extrabold">{t(DESTINATION_KEYS[option.key])}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{disabled ? t("dest.addWhatsApp") : t.dynamic(`${DESTINATION_KEYS[option.key]}.hint`, option.hint)}</span>
                </button>
              );
            })}
          </div>
        </div>
        {!free && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <div className="mb-2 text-[14px] font-bold">{t("budget")}</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("dailyBudget")}>
                {AD_BUDGETS.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={budget === value} onClick={() => setBudget(value)} className={cx("min-h-[40px] rounded-full border px-4 text-[14px] font-bold", budget === value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                    {t("perDay", { amount: naira(value) })}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[14px] font-bold">{t("for")}</div>
              <div className="flex items-center gap-2" role="group" aria-label={t("daysLabel")}>
                <button type="button" aria-label={t("dayFewer")} onClick={() => setDays((value) => Math.max(1, value - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-app-line text-[18px] font-bold">−</button>
                <span className="min-w-[64px] text-center text-[15px] font-extrabold" aria-live="polite">{t("days", { count: days })}</span>
                <button type="button" aria-label={t("dayMore")} onClick={() => setDays((value) => Math.min(30, value + 1))} className="grid h-10 w-10 place-items-center rounded-full border border-app-line text-[18px] font-bold">+</button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-app-canvas px-4 py-3">
          <span className="text-[14px]">{free ? t("statusFree") : <>= <strong>{naira(budget * days)}</strong>, {t("paidTo", { platform: AD_PLATFORMS.find((option) => option.key === platform)?.label ?? "" })}</>}</span>
          <PillButton type="button" busy={busy} onClick={() => void create()}>{t("writeMy")}</PillButton>
        </div>
        {error && <Notice>{error}</Notice>}
      </div>
    </section>
  );
}

function AdCard({ ad, onChange }: { ad: Ad; onChange: () => void }) {
  const t = useT("ads", "common");
  const [headline, setHeadline] = useState(ad.headline);
  const [text, setText] = useState(ad.primaryText);
  const [spend, setSpend] = useState(ad.stats.spend ? String(ad.stats.spend) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const platform = AD_PLATFORMS.find((option) => option.key === ad.platform);
  const edited = headline !== ad.headline || text !== ad.primaryText;

  async function patch(key: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      await send(`/api/app/ads/${ad.id}`, "PATCH", body);
      onChange();
    } catch (patchError) {
      setError(patchError instanceof Error ? friendlyError(patchError) : t("err.update"));
    } finally {
      setBusy(null);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError(t("err.copy"));
    }
  }

  return (
    <article className={cx(card, "grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]")}>
      {/* Preview, like the post people will see */}
      <div className="overflow-hidden rounded-[18px] border border-app-line">
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] font-bold">
          <span>{platform?.label}</span>
          <span className="text-app-ink-soft">· Sponsored</span>
        </div>
        <div className="aspect-square bg-app-canvas">
          {ad.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="bg-app-canvas px-3 py-2 text-[13px] font-extrabold">{ad.destination === "whatsapp" ? "Send WhatsApp message" : "Shop now"}</div>
        <p className="m-0 px-3 py-2 text-[12.5px] leading-[1.45]">{text}</p>
      </div>

      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[17px] font-extrabold">{ad.productName ?? ad.headline}</h3>
            <div className="text-[13px] text-app-ink-soft">
              {STATUS_LABEL[ad.status] ? t.dynamic(`status.${ad.status}`, STATUS_LABEL[ad.status]) : ad.status}
              {ad.status === "running" && ` · ${t("dayOf", { day: ad.day + 1, days: ad.days })}`}
              {ad.platform !== "whatsapp_status" && ` · ${t("perDay", { amount: naira(ad.dailyBudget) })}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ad.status === "draft" && <PillButton size="sm" busy={busy === "start"} onClick={() => void patch("start", { status: "running" })}>{t("started")}</PillButton>}
            {ad.status === "running" && <PillButton size="sm" tone="white" busy={busy === "pause"} onClick={() => void patch("pause", { status: "paused" })}>{t("pausedIt")}</PillButton>}
            {ad.status === "paused" && <PillButton size="sm" busy={busy === "start"} onClick={() => void patch("start", { status: "running" })}>{t("runningAgain")}</PillButton>}
            {(ad.status === "running" || ad.status === "paused") && <PillButton size="sm" tone="white" busy={busy === "end"} onClick={() => void patch("end", { status: "ended" })}>{t("end")}</PillButton>}
          </div>
        </div>

        {ad.advice && (
          <div className={cx("rounded-[16px] px-4 py-3 text-[14px] font-semibold", ad.advice.tone === "warning" ? "bg-[#FDF0D5] text-[#8A5A00]" : ad.advice.tone === "success" ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft")}>
            {t("peggy")} {ad.advice.text}
          </div>
        )}

        <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [ad.destination === "whatsapp" ? t("stat.tapsWhatsApp") : t("stat.taps"), String(ad.stats.clicks)],
            [t("stat.orders"), String(ad.stats.orders)],
            [t("stat.spent"), naira(ad.stats.spend)],
            [t("stat.perOrder"), ad.costPerOrder ? naira(ad.costPerOrder) : "–"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[14px] bg-app-canvas px-3 py-2">
              <dt className="text-[12px] text-app-ink-soft">{label}</dt>
              <dd className="m-0 text-[16px] font-extrabold">{value}</dd>
            </div>
          ))}
        </dl>

        {ad.status === "draft" ? (
          <>
            <div>
              <FieldLabel htmlFor={`headline-${ad.id}`}>{t("headline")}</FieldLabel>
              <TextInput id={`headline-${ad.id}`} value={headline} maxLength={80} onChange={(event) => setHeadline(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor={`text-${ad.id}`}>{t("adText")}</FieldLabel>
              <textarea id={`text-${ad.id}`} rows={3} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} className="w-full rounded-[16px] border border-app-line px-4 py-3 text-[15px]" />
              <VoiceInputButton value={text} onChange={setText} maxLength={500} context="the text of an advert" className="mt-2" />
            </div>
            {edited && <PillButton size="sm" tone="white" busy={busy === "copy"} onClick={() => void patch("copy", { headline, primaryText: text })}>{t("saveChanges")}</PillButton>}
          </>
        ) : null}

        <div className="rounded-[16px] border border-app-line p-3">
          <div className="text-[13px] font-bold">{t("adLink")}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[13px]">{ad.link}</code>
            <button type="button" onClick={() => void copy("link", ad.link)} className="rounded-full border border-app-line px-3.5 py-1.5 text-[13px] font-bold">{copied === "link" ? t("copied") : t("copyLink")}</button>
            <button type="button" onClick={() => void copy("text", `${text}\n${ad.link}`)} className="rounded-full border border-app-line px-3.5 py-1.5 text-[13px] font-bold">{copied === "text" ? t("copied") : t("copyText")}</button>
          </div>
          <p className="mb-0 mt-2 text-[12.5px] leading-[1.5] text-app-ink-soft">{PLATFORM_HELP[ad.platform] ? t.dynamic(`help.${ad.platform}`, PLATFORM_HELP[ad.platform]) : null}</p>
        </div>

        {ad.platform !== "whatsapp_status" && ad.status !== "draft" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1">
              <FieldLabel htmlFor={`spend-${ad.id}`}>{t("spentSoFar", { platform: platform?.label ?? "" })}</FieldLabel>
              <TextInput id={`spend-${ad.id}`} inputMode="numeric" value={spend} onChange={(event) => setSpend(event.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <PillButton size="md" tone="white" busy={busy === "spend"} onClick={() => void patch("spend", { spend: Number(spend) || 0 })}>{t("update")}</PillButton>
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" className="text-[13px] font-bold text-app-danger" onClick={async () => { if ((await confirmDialog(t("confirmDelete")))) { setBusy("delete"); send(`/api/app/ads/${ad.id}`, "DELETE").then(onChange, (deleteError) => { setError(deleteError.message); setBusy(null); }); } }}>
            {t("deleteAd")}
          </button>
        </div>
        {error && <Notice>{error}</Notice>}
      </div>
    </article>
  );
}

/** `image`: a picture from Rex or the media library to use as the ad's picture instead of the product photo. */
export function AdsManager({ ads, products, hasWhatsapp, image = null, initialProductId }: { ads: Ad[]; products: Product[]; hasWhatsapp: boolean; storeName: string; image?: string | null; initialProductId?: string }) {
  const router = useRouter();
  const t = useT("ads");
  const refresh = () => router.refresh();
  return (
    <div className="grid gap-4">
      <Notice tone="info">
        {t("payNote", { days: STOP_RULE_DAYS })}
      </Notice>
      <NewAd products={products} hasWhatsapp={hasWhatsapp} onCreated={refresh} image={image} initialProductId={initialProductId} />
      {ads.map((ad) => <AdCard key={ad.id} ad={ad} onChange={refresh} />)}
    </div>
  );
}
