"use client";

import { lazy, Suspense, useEffect, useId, useMemo, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { useStoreVisitor } from "@/hooks/useStoreVisitor";
import { formatStoreMoney, freeDeliveryEverywhereOver, readShopperInfo } from "@/lib/storefront/shopper-info";
import { TIER_NAMES, popupDue, readGameConfig, readSectionDisplay, sliceLabel, type GameSectionKind, type GamificationConfig } from "@/lib/gamification/logic";
import { markShown, popupMemory, type GameColors } from "./client";
import { RewardProgress } from "./RewardProgress";
import { Wheel } from "./Wheel";

// The store builder's reward sections, drawn by both storefront renderers (BoutiqueStorefront and
// TemplateStorefrontSurface) in the theme's own colours:
//   spin-wheel / scratch-card: a pop-up (on entry, exit intent, after N seconds or on scroll) or an inline card;
//   reward-progress: the free-delivery and reward-tier bar for the shopper's bag;
//   loyalty-banner: how points work, the tiers, and a "check your points" box.
// Prizes, odds and on/off live in Marketing > Rewards; the section sets where and how it shows. In the
// builder every section previews with the seller's settings (or sample ones) and never calls the server.

const GameDialog = lazy(() => import("./GameDialog"));

export interface GameSectionStore {
  slug: string;
  currency: string;
  brandSettings?: unknown;
  shopper?: unknown;
  storeProducts: Array<{ id: string; name: string; retailPrice: number; images?: string[] }>;
}

export interface GameSectionProps {
  kind: GameSectionKind;
  section: { id: string; settings?: Record<string, unknown>; blocks: Array<{ type: string; content?: unknown }> };
  store: GameSectionStore;
  colors: GameColors;
  mode: "live" | "editor";
}

function copyOf(section: GameSectionProps["section"]): Record<string, unknown> {
  const content = section.blocks.find((block) => block.type === "copy")?.content;
  return content && typeof content === "object" && !Array.isArray(content) ? (content as Record<string, unknown>) : {};
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function GameSection(props: GameSectionProps) {
  const config = useMemo(() => readGameConfig((props.store.brandSettings as Record<string, unknown> | undefined)?.gamification ?? {}), [props.store.brandSettings]);
  const giftNames = useMemo(() => Object.fromEntries(props.store.storeProducts.map((product) => [product.id, product.name])), [props.store.storeProducts]);
  switch (props.kind) {
    case "spin-wheel":
    case "scratch-card":
      return <PopupGame {...props} config={config} giftNames={giftNames} game={props.kind === "spin-wheel" ? "wheel" : "scratch"} />;
    case "reward-progress":
      return <ProgressSection {...props} config={config} giftNames={giftNames} />;
    default:
      return <LoyaltySection {...props} config={config} />;
  }
}

function Band({ colors, children, label }: { colors: GameColors; children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[1100px] rounded-[var(--sib-r)] border p-5 sm:p-7" style={{ ["--sib-r" as string]: `${Math.min(colors.radius, 28)}px`, borderColor: colors.border, background: colors.card, color: colors.ink }}>{children}</div>
    </section>
  );
}

function EditorNote({ colors, children }: { colors: GameColors; children: React.ReactNode }) {
  return (
    <p className="m-0 mt-3 flex items-start gap-2 rounded-[12px] border border-dashed px-3 py-2 text-[12.5px] leading-5" style={{ borderColor: colors.border, color: colors.muted }}>
      <Icon name="info" size={13} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </p>
  );
}

const TRIGGER_TEXT = { entry: "as the page opens", exit: "when they're about to leave (phones: halfway down the page)", delay: (s: number) => `after ${s} seconds`, scroll: (p: number) => `after scrolling ${p}% of the page` };

function PopupGame({ section, store, colors, mode, config, giftNames, game }: GameSectionProps & { config: GamificationConfig; giftNames: Record<string, string>; game: "wheel" | "scratch" }) {
  const live = mode === "live";
  const settings = config[game];
  // Same defaults as the inspector (section-schema.ts): the wheel is a pop-up, the scratch card sits on the page.
  const display = readSectionDisplay(section.settings, settings, game === "wheel" ? "popup" : "inline");
  const copy = copyOf(section);
  const title = text(copy.title) || settings.headline;
  const body = text(copy.body) || settings.body;
  const button = text(copy.buttonLabel) || (game === "wheel" ? "Spin the wheel" : "Scratch to reveal");
  const visitorKey = useStoreVisitor(live ? store.slug : "");
  const [open, setOpen] = useState(false);
  const [demo, setDemo] = useState(false);

  // Live pop-up: wait for the trigger, at most once per session and once per frequency period, never after a play.
  useEffect(() => {
    if (!live || !settings.enabled || display.display !== "popup") return;
    if (!popupDue(settings, popupMemory(store.slug, game))) return;
    let fired = false;
    const cleanups: Array<() => void> = [];
    const show = () => {
      if (fired) return;
      fired = true;
      cleanups.forEach((cleanup) => cleanup());
      markShown(store.slug, game);
      setOpen(true);
    };
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const trigger = display.trigger === "exit" && isMobile ? "scroll" : display.trigger;
    if (trigger === "entry" || trigger === "delay") {
      const timer = window.setTimeout(show, trigger === "entry" ? 1200 : display.delaySeconds * 1000);
      cleanups.push(() => window.clearTimeout(timer));
    } else if (trigger === "exit") {
      const onLeave = (event: MouseEvent) => {
        if (!event.relatedTarget && event.clientY <= 0) show();
      };
      document.addEventListener("mouseout", onLeave);
      cleanups.push(() => document.removeEventListener("mouseout", onLeave));
    } else {
      const target = display.trigger === "exit" ? 50 : display.scrollPercent;
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0 || (window.scrollY / max) * 100 >= target) show();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, settings.enabled, display.display, display.trigger, display.delaySeconds, display.scrollPercent, store.slug, game]);

  const dialog = open ? (
    <Suspense fallback={null}>
      <GameDialog game={game} storeSlug={store.slug} currency={store.currency} config={config} colors={colors} onClose={() => setOpen(false)} demo={demo} headline={title} body={body} visitorKey={visitorKey || undefined} giftNames={giftNames} />
    </Suspense>
  ) : null;

  if (live && !settings.enabled) return null;
  if (live && display.display === "popup") return dialog;

  const slices = config.prizes.slices.map((slice) => ({ id: slice.id, label: slice.kind === "free_gift" && slice.productId && giftNames[slice.productId] && !slice.label ? `Free ${giftNames[slice.productId]}` : sliceLabel(slice, (n) => formatStoreMoney(n, store.currency)) }));
  const trigger = display.trigger === "delay" ? TRIGGER_TEXT.delay(display.delaySeconds) : display.trigger === "scroll" ? TRIGGER_TEXT.scroll(display.scrollPercent) : TRIGGER_TEXT[display.trigger];
  return (
    <Band colors={colors} label={title}>
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          {!live && display.display === "popup" ? <p className="m-0 mb-2 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: colors.muted }}>Pop-up preview</p> : null}
          <h2 className="m-0 text-[24px] font-semibold leading-tight sm:text-[28px]" style={{ fontFamily: colors.heading }}>{title}</h2>
          {body ? <p className="mb-0 mt-2 max-w-[56ch] text-[15px] leading-6" style={{ color: colors.muted }}>{body}</p> : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setDemo(!live);
              setOpen(true);
            }}
            className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: colors.cta, color: colors.ctaText }}
          >
            <Icon name="sparkle" size={15} /> {live ? button : `Try it (${display.display === "popup" ? "pop-up" : "preview"})`}
          </button>
          {!live ? (
            <EditorNote colors={colors}>
              {!settings.enabled
                ? <>Shoppers won&apos;t see this until you turn on {game === "wheel" ? "Spin the wheel" : "Scratch card"} in <strong>Marketing › Rewards</strong>, where you set the prizes and odds.</>
                : display.display === "popup"
                  ? <>Opens as a pop-up {trigger}, once per visit, at most every {settings.frequencyDays} {settings.frequencyDays === 1 ? "day" : "days"}. Prizes and odds are in <strong>Marketing › Rewards</strong>.</>
                  : <>Shows on the page with a button. Prizes and odds are in <strong>Marketing › Rewards</strong>.</>}
            </EditorNote>
          ) : null}
        </div>
        <div className="justify-self-center" aria-hidden>
          {game === "wheel" ? (
            <Wheel slices={slices} colors={colors} size={200} />
          ) : (
            <div className="grid h-[130px] w-[220px] place-items-center rounded-[16px] text-[15px] font-semibold" style={{ background: "linear-gradient(135deg,#C9C9C9,#EDEDED 50%,#B5B5B5)", color: "#4A4A4A" }}>
              Scratch here
            </div>
          )}
        </div>
      </div>
      {dialog}
    </Band>
  );
}

function ProgressSection({ section, store, colors, mode, config, giftNames }: GameSectionProps & { config: GamificationConfig; giftNames: Record<string, string> }) {
  const live = mode === "live";
  const cart = useCart(store.slug);
  const freeOver = config.progress.freeDelivery ? freeDeliveryEverywhereOver(readShopperInfo(store.shopper).delivery) : null;
  const tiers = config.progress.tiers;
  const first = Math.min(...[freeOver ?? Infinity, ...tiers.map((tier) => tier.threshold)]);
  const hasMilestones = Number.isFinite(first);
  const title = text(copyOf(section).title);
  if (live && (!config.progress.enabled || !hasMilestones)) return null;
  // Builder: a sample bag 60% of the way to the first reward (or made-up milestones when none are set).
  const sampleTiers = hasMilestones ? tiers : [{ id: "sample", threshold: 30000, kind: "percent" as const, value: 5, productId: null, label: "" }];
  const subtotal = live ? cart.subtotal : Math.round((hasMilestones ? first : 30000) * 0.6);
  const byId = new Map(store.storeProducts.map((product) => [product.id, product]));
  return (
    <Band colors={colors} label={title || "Rewards for your bag"}>
      {title ? <h2 className="m-0 mb-3 text-[20px] font-semibold" style={{ fontFamily: colors.heading }}>{title}</h2> : null}
      <RewardProgress
        subtotal={subtotal}
        freeDeliveryOver={live || hasMilestones ? freeOver : null}
        tiers={live || hasMilestones ? tiers : sampleTiers}
        currency={store.currency}
        colors={colors}
        giftNames={giftNames}
        giftInBag={(id) => cart.items.some((line) => line.productId === id)}
        onAddGift={live ? (id) => { const gift = byId.get(id); if (gift) cart.add({ productId: gift.id, name: gift.name, price: gift.retailPrice, image: gift.images?.[0] }); } : undefined}
      />
      {!live ? (
        <EditorNote colors={colors}>
          {!config.progress.enabled
            ? <>Reward progress is off. Turn it on in <strong>Marketing › Rewards</strong>.</>
            : hasMilestones
              ? <>Preview with a sample bag. Shoppers see their own bag. Free delivery comes from your delivery settings; tiers from Marketing › Rewards.</>
              : <>Sample milestones. Add reward tiers in <strong>Marketing › Rewards</strong>, or a free-delivery amount in your delivery settings.</>}
        </EditorNote>
      ) : null}
    </Band>
  );
}

function LoyaltySection({ section, store, colors, mode, config }: GameSectionProps & { config: GamificationConfig }) {
  const live = mode === "live";
  const loyalty = config.loyalty;
  const copy = copyOf(section);
  const id = useId();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);
  if (live && !loyalty.enabled) return null;
  const money = (n: number) => formatStoreMoney(n, store.currency);
  const tiers = [
    { tier: "bronze" as const, from: 0, multiplier: 1, perk: "" },
    { tier: "silver" as const, from: loyalty.silverAt, multiplier: loyalty.silverMultiplier, perk: loyalty.silverPerk },
    { tier: "gold" as const, from: loyalty.goldAt, multiplier: loyalty.goldMultiplier, perk: loyalty.goldPerk },
  ];

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!live) return;
    setBusy(true);
    setResult("");
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(store.slug)}/game/points`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), phone: phone.trim() }) });
      const json = await res.json().catch(() => null);
      const data = json?.data;
      setResult(!res.ok ? json?.error?.message ?? "Couldn't check. Try again." : data?.found ? `You have ${Number(data.balance).toLocaleString("en-NG")} points (${money(data.valueOfBalance)}), ${data.tierName} member${data.next ? `. ${Number(data.next.remaining).toLocaleString("en-NG")} more points to ${data.next.tierName}` : ""}.` : "We couldn't find points for that email and phone. Use the details from your orders.");
    } catch {
      setResult("Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Band colors={colors} label="Loyalty points">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="m-0 text-[24px] font-semibold leading-tight sm:text-[28px]" style={{ fontFamily: colors.heading }}>{text(copy.title) || "Earn points every time you shop"}</h2>
          <p className="mb-0 mt-2 text-[15px] leading-6" style={{ color: colors.muted }}>
            {text(copy.body) || `Get ${loyalty.pointsPer100} ${loyalty.pointsPer100 === 1 ? "point" : "points"} for every ${money(100)} you spend. Each point is worth ${money(loyalty.pointValue)} at checkout.`}
          </p>
          <ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-3">
            {tiers.map((tier) => (
              <li key={tier.tier} className="rounded-[14px] border p-3 text-[13.5px]" style={{ borderColor: colors.border }}>
                <strong className="block text-[15px]">{TIER_NAMES[tier.tier]}</strong>
                <span style={{ color: colors.muted }}>{tier.from ? `From ${tier.from.toLocaleString("en-NG")} points` : "When you join"}</span>
                <span className="mt-1 block">{tier.multiplier > 1 ? `${tier.multiplier}× points` : "Standard points"}{tier.perk ? ` · ${tier.perk}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={check} className="grid content-start gap-2.5 rounded-[16px] p-4" style={{ background: colors.paper }} aria-labelledby={`${id}-h`}>
          <h3 id={`${id}-h`} className="m-0 text-[16px] font-semibold">Check your points</h3>
          <label className="grid gap-1 text-[13px] font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={!live} className="h-11 rounded-full border bg-white px-4 text-[15px]" style={{ borderColor: colors.border, color: "#16141F" }} /></label>
          <label className="grid gap-1 text-[13px] font-medium">Phone from your orders<input type="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" disabled={!live} className="h-11 rounded-full border bg-white px-4 text-[15px]" style={{ borderColor: colors.border, color: "#16141F" }} /></label>
          <button type="submit" disabled={!live || busy} className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[15px] font-bold disabled:opacity-60" style={{ background: colors.cta, color: colors.ctaText }}>
            {busy ? "Checking…" : "Check points"}
          </button>
          <p className="m-0 min-h-5 text-[13.5px]" role="status" aria-live="polite">{result}</p>
        </form>
      </div>
      {!live ? (
        <EditorNote colors={colors}>
          {loyalty.enabled ? <>Points rates and tiers come from <strong>Marketing › Rewards</strong>.</> : <>Loyalty points are off, so shoppers won&apos;t see this. Turn them on in <strong>Marketing › Rewards</strong>.</>}
        </EditorNote>
      ) : null}
    </Band>
  );
}
