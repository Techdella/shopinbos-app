"use client";

/* eslint-disable @next/next/no-img-element -- the seller's own logo. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx, FieldLabel, Mascot, TextInput } from "@/components/app-ui";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { useT } from "@/components/i18n/I18nProvider";
import {
  SELL_CHIPS,
  cleanFirstName,
  cleanLinkInput,
  cleanShopName,
  linkProblem,
  linkSlug,
  linkSuggestions,
  shopNameProblem,
  themeFor,
} from "@shared/seller-onboarding";
import { applyTheme, checkAddress, renameStore, saveAddress, track, type StoreAddress } from "./api";
import { RexFrame, RexSays } from "./Frame";
import { Chip } from "./parts";
import type { StepCtx } from "./context";

// Shop basics (B1–B4) and "How do you want to build it?" (C1, design RB-01) on the web: the phone's
// rex-build/basics.tsx with the same words (the "rexBuild" namespace) and the same rules (shared/seller-onboarding.ts).

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** B1 "Let's open your shop": Rex, three questions, about two minutes, free to start. */
export function IntroStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  return (
    <RexFrame {...ctx.frame} step={null} close primary={{ title: t("intro.start"), onPress: () => void ctx.next(), testId: "intro-start" }}>
      {/* English first; Pidgin, Yorùbá, Hausa and Igbo from the language switch (it changes the whole app). */}
      <div className="flex justify-end">
        <LanguagePicker variant="compact" />
      </div>
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <span className="grid h-[168px] w-[168px] place-items-center overflow-hidden rounded-full border-[5px] border-app-forest bg-app-mint">
          <Mascot name="rex" mood="wave" alt="" className="h-[150px] w-[150px]" />
        </span>
        <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.6px] sm:text-[40px]">{t("intro.title")}</h1>
        <p className="m-0 max-w-[420px] text-[17px] leading-[1.45] text-app-ink-soft">{t("intro.rex")}</p>
        <span className="inline-flex items-center gap-2 rounded-full bg-app-success-tint px-3.5 py-2 text-[14.5px] font-bold text-app-success">
          <Icon name="check" size={16} strokeWidth={2.6} />
          {t("intro.free")}
        </span>
      </div>
    </RexFrame>
  );
}

/** B2 "What should we call you?" (new): the first name Rex greets them with. */
export function NameStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const [name, setName] = useState(ctx.flow.firstName || ctx.data.owner.firstName || "");
  const clean = cleanFirstName(name);
  const go = () => (clean ? void ctx.next({ firstName: clean }) : ctx.setError(t("name.needed")));
  return (
    <RexFrame {...ctx.frame} step={null} basics={{ current: 1, total: 3 }} primary={{ title: t("frame.next"), disabled: !clean, onPress: go, testId: "name-next" }}>
      <RexSays title={t("name.title")} sub={t("name.rex")} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go();
        }}
      >
        <FieldLabel htmlFor="rex-first-name">{t("name.label")}</FieldLabel>
        <TextInput id="rex-first-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("name.placeholder")} autoComplete="given-name" maxLength={40} className="h-[60px] text-[22px] font-bold" />
      </form>
    </RexFrame>
  );
}

/** B3 "What do you sell?": one or more category chips (they drive Rex's suggestions). */
export function SellStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const [chosen, setChosen] = useState<string[]>(ctx.flow.categories ?? []);
  const toggle = (key: string) => setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  return (
    <RexFrame
      {...ctx.frame}
      step={null}
      basics={{ current: 2, total: 3 }}
      primary={{ title: t("frame.next"), disabled: !chosen.length, onPress: () => void ctx.next({ categories: chosen as never }), testId: "sell-next" }}
      footerExtra={chosen.length ? <p className="m-0 text-center text-[14px] text-app-ink-soft">{t("sell.picked", { count: chosen.length })}</p> : null}
    >
      <RexSays title={t("sell.title")} sub={t("sell.rex")} />
      <div className="flex flex-wrap gap-2.5">
        {SELL_CHIPS.map((key) => (
          <Chip key={key} testId={`sell-${key}`} label={t.dynamic(`sell.cat.${key}`, key)} on={chosen.includes(key)} onPress={() => toggle(key)} />
        ))}
      </div>
    </RexFrame>
  );
}

/** B4 "What's your shop called?" with the free link `adashair.mybos.store` checked as they type. */
export function ShopStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const start = /'s Store$/.test(ctx.data.store.name) ? "" : ctx.data.store.name;
  const [name, setName] = useState(start);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [address, setAddress] = useState<StoreAddress | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const slug = typed ?? linkSlug(name);
  const nameProblem = name.trim() ? shopNameProblem(name) : null;
  const shapeProblem = slug ? linkProblem(slug) : null;

  // The free link, checked a moment after typing stops (the same address route as the rest of the web).
  useEffect(() => {
    if (!slug || shapeProblem) {
      setAddress(null);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      void checkAddress(slug)
        .then(setAddress)
        .catch(() => setAddress(null))
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, shapeProblem]);

  const taken = Boolean(address && (address.problem || address.available === false));
  const host = address?.host ?? `${slug}.mybos.store`;
  const ideas = taken ? linkSuggestions(slug, ctx.data.store.city || ctx.data.store.state) : [];
  const blocked = !cleanShopName(name) || Boolean(nameProblem) || Boolean(shapeProblem) || taken || checking;

  async function save() {
    const clean = cleanShopName(name);
    if (shopNameProblem(clean) || !slug || shapeProblem || taken || checking) return;
    setBusy(true);
    ctx.setError(null);
    try {
      // Renaming never moves the address by itself (PATCH); the free link is then set on purpose.
      await renameStore(clean);
      if (slug !== ctx.data.store.slug) await saveAddress(slug);
      await ctx.next({ slugEdited: typed !== null });
      track("shop_basics_done", { categories: ctx.flow.categories ?? [], slugEdited: typed !== null });
    } catch (error) {
      ctx.setError(errorText(error, t("error.save")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} step={null} basics={{ current: 3, total: 3 }} primary={{ title: t("frame.next"), busy, disabled: blocked, onPress: () => void save(), testId: "shop-next" }}>
      <RexSays title={t("shop.title")} sub={t("shop.rex")} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FieldLabel htmlFor="rex-shop-name">{t("shop.label")}</FieldLabel>
        <TextInput id="rex-shop-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("shop.placeholder")} maxLength={60} className="h-[60px] text-[22px] font-bold" />
        {nameProblem ? <p className="m-0 mt-1.5 text-[14px] text-app-danger">{t(nameProblem === "short" ? "shop.short" : "shop.long")}</p> : null}
      </form>
      {slug ? (
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-app-line bg-white p-3.5">
          <span className="text-[13px] font-semibold text-app-ink-soft">{t("shop.link")}</span>
          <div data-testid="shop-link" aria-live="polite" className="flex items-center gap-2.5">
            <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full", taken || shapeProblem ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success")}>
              <Icon name={taken || shapeProblem ? "x" : "check"} size={14} strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1 break-words text-[16px] font-bold">
              {shapeProblem ? t(shapeProblem === "short" ? "shop.linkShort" : "shop.linkNumbers") : checking ? t("shop.checking") : taken ? t("shop.taken", { host }) : t("shop.free", { host })}
            </span>
          </div>
          {ideas.length ? (
            <div className="flex flex-wrap gap-2">
              {ideas.map((idea) => (
                <Chip key={idea} label={`${idea}.mybos.store`} on={false} onPress={() => setTyped(idea)} />
              ))}
            </div>
          ) : null}
          {editing ? (
            <TextInput value={slug} onChange={(event) => setTyped(cleanLinkInput(event.target.value))} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={40} aria-label={t("shop.edit")} />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="min-h-[36px] self-start text-[14.5px] font-bold text-app-forest hover:underline">
              {t("shop.edit")}
            </button>
          )}
        </div>
      ) : null}
    </RexFrame>
  );
}

/** C1 "How do you want to build it?": Rex builds it (recommended) or the web builder with a starter template. */
export function ChooseStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const store = ctx.data.store;
  const products = ctx.data.products?.length ?? 0;

  async function startWithRex() {
    track("build_path_chosen", { path: "rex" });
    await ctx.next({ path: "rex" });
  }

  async function designMyself() {
    setOpening(true);
    ctx.setError(null);
    try {
      // The builder needs a look: the starter template for what they sell (a basic theme, on every plan).
      if (!store.themeId) {
        const themeId = themeFor(ctx.flow.categories);
        await applyTheme(themeId);
        await ctx.save({ themeId });
      }
      await ctx.save({ path: "self" }, "build_path_chosen", { path: "self" });
      router.push("/builder");
    } catch (error) {
      ctx.setError(errorText(error, t("error.save")));
      setOpening(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} step={null} wide primary={ctx.flow.path === "self" ? { title: t("choose.checkLive"), onPress: () => ctx.go("review"), icon: "check", testId: "choose-check" } : null}>
      <div className="flex items-center gap-3.5">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full bg-app-peach text-[20px] font-extrabold text-app-accent-ink">
          {store.logoUrl ? <img src={store.logoUrl} alt="" className="h-full w-full object-cover" /> : store.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[24px] font-extrabold leading-tight">{store.name}</span>
          <span className="block truncate text-[14.5px] text-app-ink-soft">{`${store.host} · ${t("choose.notLive")}`}</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] bg-app-forest p-6 text-white">
          <span aria-hidden className="absolute -right-5 -top-5 grid h-[130px] w-[130px] place-items-center overflow-hidden rounded-full border-[3px] border-[#73D8C8]">
            <Mascot name="rex" alt="" className="h-[112px] w-[112px]" />
          </span>
          <span className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#73D8C8]">{t("choose.recommended")}</span>
          <h1 className="m-0 pr-[90px] text-[30px] font-extrabold leading-[1.1]">{t("choose.rexTitle")}</h1>
          <p className="m-0 text-[15.5px] leading-[1.45] text-white/85">{t("choose.rexBody")}</p>
          <div className="flex flex-wrap gap-2">
            {[t("choose.noSkills"), t("choose.changeLater")].map((label) => (
              <span key={label} className="rounded-full bg-white/[0.12] px-3 py-1.5 text-[13.5px] font-bold">{label}</span>
            ))}
          </div>
          <button type="button" data-testid="choose-rex" onClick={() => void startWithRex()} className="mt-1 inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-full bg-app-accent px-6 text-[17px] font-extrabold text-app-ink hover:brightness-95">
            <Icon name="sparkle" size={20} />
            {t("choose.start")}
          </button>
        </div>

        <button type="button" data-testid="choose-self" disabled={opening} onClick={() => void designMyself()} className="flex items-center gap-3.5 self-start rounded-[24px] border border-app-line bg-white p-4 text-left hover:border-app-line-strong disabled:opacity-70 lg:self-stretch">
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[16px] bg-app-canvas">
            <Icon name="palette" size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-extrabold">{t("choose.selfTitle")}</span>
            <span className="block text-[14.5px] leading-[1.4] text-app-ink-soft">{opening ? t("choose.opening") : t("choose.selfBodyWeb")}</span>
          </span>
          <Icon name="chevRight" size={20} className="shrink-0 text-app-ink-soft" />
        </button>
      </div>

      {products ? (
        <div className="flex items-center gap-3 rounded-[22px] border border-app-line bg-white p-3.5">
          <span className="shrink-0 rounded-full bg-app-peach px-3 py-1.5 text-[14px] font-extrabold text-app-accent-ink">{t("choose.products", { count: products })}</span>
          <span className="min-w-0 flex-1 text-[14.5px] text-app-ink-soft">{t("choose.productsHave")}</span>
        </div>
      ) : null}
    </RexFrame>
  );
}
