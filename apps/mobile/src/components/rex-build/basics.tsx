import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { LanguageButton } from "@/components/LanguagePicker";
import { Chip, Field, Label, Mascot, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { checkAddress, saveAddress, type StoreAddress } from "@/lib/onboarding";
import { applyLook } from "@/lib/templates";
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
  track,
} from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";
import { RexFrame, RexSays } from "./Frame";
import type { StepCtx } from "./context";

// Shop basics (B1–B4) and "How do you want to build it?" (C1, design RB-01).

/** B1 "Let's open your shop": Rex, three questions, about two minutes, free to start. */
export function IntroStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  return (
    <RexFrame {...ctx.frame} step={null} close primary={{ title: t("intro.start"), onPress: () => void ctx.next(), testID: "intro-start" }}>
      {/* English first; Pidgin, Yorùbá, Hausa and Igbo from the language switch (it changes the whole app). */}
      <View style={{ alignItems: "flex-end" }}>
        <LanguageButton />
      </View>
      <View style={{ alignItems: "center", gap: 16, paddingTop: 8 }}>
        <View style={{ width: 168, height: 168, borderRadius: 84, borderWidth: 5, borderColor: colors.forestFill, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Mascot name="rex" mood="wave" size={150} label="" />
        </View>
        <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, textAlign: "center", letterSpacing: -0.6 }}>{t("intro.title")}</T>
        <T style={{ fontSize: 17, lineHeight: 24, color: colors.inkSoft, textAlign: "center", paddingHorizontal: 12 }}>{t("intro.rex")}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successTint, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
          <AppIcon name="check" size={16} color={colors.success} strokeWidth={2.6} />
          <T weight="bold" style={{ color: colors.success, fontSize: 14.5 }}>{t("intro.free")}</T>
        </View>
      </View>
    </RexFrame>
  );
}

/** B2 "What should we call you?" (new): the first name Rex greets them with. */
export function NameStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const [name, setName] = useState(ctx.flow.firstName || ctx.data.owner.firstName || "");
  const clean = cleanFirstName(name);
  return (
    <RexFrame {...ctx.frame} step={null} basics={{ current: 1, total: 3 }} primary={{ title: t("frame.next"), disabled: !clean, onPress: () => void ctx.next({ firstName: clean }), testID: "name-next" }}>
      <RexSays title={t("name.title")} sub={t("name.rex")} />
      <View>
        <Label>{t("name.label")}</Label>
        <Field
          autoFocus
          value={name}
          onChangeText={setName}
          placeholder={t("name.placeholder")}
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={40}
          returnKeyType="next"
          onSubmitEditing={() => (clean ? void ctx.next({ firstName: clean }) : ctx.setError(t("name.needed")))}
          accessibilityLabel={t("name.label")}
          style={{ fontSize: 22, fontFamily: fonts.bold }}
        />
      </View>
    </RexFrame>
  );
}

/** B3 "What do you sell?": one or more category chips (they drive Rex's suggestions). */
export function SellStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const [chosen, setChosen] = useState<string[]>(ctx.flow.categories ?? []);
  const toggle = (key: string) => setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  return (
    <RexFrame
      {...ctx.frame}
      step={null}
      basics={{ current: 2, total: 3 }}
      primary={{ title: t("frame.next"), disabled: !chosen.length, onPress: () => void ctx.next({ categories: chosen as never }), testID: "sell-next" }}
      footerExtra={chosen.length ? <T style={{ textAlign: "center", fontSize: 14, color: colors.inkSoft }}>{t("sell.picked", { count: chosen.length })}</T> : null}
    >
      <RexSays title={t("sell.title")} sub={t("sell.rex")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SELL_CHIPS.map((key) => (
          <Chip key={key} label={t(`sell.cat.${key}`)} on={chosen.includes(key)} onPress={() => toggle(key)} />
        ))}
      </View>
    </RexFrame>
  );
}

/** B4 "What's your shop called?" with the free link `adashair.mybos.store` checked as they type. */
export function ShopStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
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

  useEffect(() => {
    if (!slug || shapeProblem) {
      setAddress(null);
      return;
    }
    // The current link is already the shop's own: nothing to check.
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

  async function save() {
    const clean = cleanShopName(name);
    if (shopNameProblem(clean) || !slug || shapeProblem || taken || checking) return;
    setBusy(true);
    ctx.setError(null);
    try {
      // Renaming never moves the address by itself (PATCH); the free link is then set on purpose.
      await api("/api/app/store", { method: "PATCH", json: { name: clean } });
      if (slug !== ctx.data.store.slug) await saveAddress(slug);
      await ctx.next({ slugEdited: typed !== null }, {});
      track("shop_basics_done", { categories: ctx.flow.categories ?? [], slugEdited: typed !== null });
    } catch (error) {
      ctx.setError(error instanceof Error && error.message ? error.message : t("error.save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} step={null} basics={{ current: 3, total: 3 }} primary={{ title: t("frame.next"), busy, disabled: !cleanShopName(name) || Boolean(nameProblem) || Boolean(shapeProblem) || taken || checking, onPress: () => void save(), testID: "shop-next" }}>
      <RexSays title={t("shop.title")} sub={t("shop.rex")} />
      <View>
        <Label>{t("shop.label")}</Label>
        <Field autoFocus value={name} onChangeText={setName} placeholder={t("shop.placeholder")} maxLength={60} accessibilityLabel={t("shop.label")} style={{ fontSize: 22, fontFamily: fonts.bold }} />
        {nameProblem ? <T style={{ color: colors.danger, fontSize: 14, marginTop: 6 }}>{t(nameProblem === "short" ? "shop.short" : "shop.long")}</T> : null}
      </View>
      {slug ? (
        <View style={{ ...surfaceCard(20), padding: 14, gap: 10 }}>
          <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("shop.link")}</T>
          <View testID="shop-link" accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: taken || shapeProblem ? colors.dangerTint : colors.successTint, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name={taken || shapeProblem ? "x" : "check"} size={14} color={taken || shapeProblem ? colors.danger : colors.success} strokeWidth={3} />
            </View>
            <T weight="bold" style={{ flex: 1, fontSize: 16 }}>
              {shapeProblem ? t(shapeProblem === "short" ? "shop.linkShort" : "shop.linkNumbers") : checking ? t("shop.checking") : taken ? t("shop.taken", { host }) : t("shop.free", { host })}
            </T>
          </View>
          {ideas.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ideas.map((idea) => (
                <Chip key={idea} label={`${idea}.mybos.store`} on={false} onPress={() => setTyped(idea)} />
              ))}
            </View>
          ) : null}
          {editing ? (
            <Field value={slug} onChangeText={(value) => setTyped(cleanLinkInput(value))} autoCapitalize="none" autoCorrect={false} maxLength={40} accessibilityLabel={t("shop.edit")} />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={6} style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
              <T weight="bold" style={{ color: colors.forest, fontSize: 14.5 }}>{t("shop.edit")}</T>
            </Pressable>
          )}
        </View>
      ) : null}
    </RexFrame>
  );
}

/** C1 "How do you want to build it?": Rex builds it (recommended) or the editor with a starter template. */
export function ChooseStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const [opening, setOpening] = useState(false);
  const store = ctx.data.store;
  const products = ctx.data.products?.length ?? 0;
  const reload = ctx.reload;

  // Back from the editor: a shop published there goes to "is live"; otherwise this screen offers "Check and go live".
  useFocusEffect(
    useCallback(() => {
      if (ctx.flow.path !== "self") return;
      void reload().then((fresh) => {
        if (fresh?.store.live) router.replace("/onboarding/launched");
      });
    }, [ctx.flow.path, reload]),
  );

  async function startWithRex() {
    track("build_path_chosen", { path: "rex" });
    await ctx.next({ path: "rex" });
  }

  async function designMyself() {
    setOpening(true);
    ctx.setError(null);
    try {
      // The editor needs a look: the starter template for what they sell (a basic theme, on every plan).
      if (!store.themeId) {
        const themeId = themeFor(ctx.flow.categories);
        await applyLook(themeId);
        await ctx.save({ themeId });
      }
      await ctx.save({ path: "self" }, "build_path_chosen", { path: "self" });
      router.push("/store-editor");
    } catch (error) {
      ctx.setError(error instanceof Error && error.message ? error.message : t("error.save"));
    } finally {
      setOpening(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} step={null} primary={ctx.flow.path === "self" ? { title: t("choose.checkLive"), onPress: () => router.push("/onboarding/review"), icon: "check" } : null}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, overflow: "hidden", backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
          {store.logoUrl ? <Image source={{ uri: store.logoUrl }} style={{ width: 52, height: 52 }} /> : <T weight="extrabold" style={{ fontSize: 20, color: colors.accentInk }}>{store.name.slice(0, 1).toUpperCase()}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 28 }} numberOfLines={1}>{store.name}</T>
          <T style={{ fontSize: 14.5, color: colors.inkSoft }} numberOfLines={1}>{`${store.host} · ${t("choose.notLive")}`}</T>
        </View>
      </View>

      <View style={{ backgroundColor: colors.forestFill, borderRadius: 28, padding: 22, gap: 12, overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -18, top: -18, width: 130, height: 130, borderRadius: 65, borderWidth: 3, borderColor: "#73D8C8", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <Mascot name="rex" size={112} label="" />
        </View>
        <T weight="extrabold" style={{ color: "#73D8C8", fontSize: 13, letterSpacing: 1.4 }}>{t("choose.recommended").toUpperCase()}</T>
        <T accessibilityRole="header" style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 30, lineHeight: 33, paddingRight: 90 }}>{t("choose.rexTitle")}</T>
        <T style={{ color: "rgba(255,255,255,0.86)", fontSize: 15.5, lineHeight: 22 }}>{t("choose.rexBody")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[t("choose.noSkills"), t("choose.changeLater")].map((label) => (
            <View key={label} style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <T weight="bold" style={{ color: "#FFFFFF", fontSize: 13.5 }}>{label}</T>
            </View>
          ))}
        </View>
        <Pressable testID="choose-rex" accessibilityRole="button" onPress={() => void startWithRex()} style={({ pressed }) => ({ marginTop: 4, minHeight: 56, borderRadius: radii.pill, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: pressed ? 0.88 : 1 })}>
          <AppIcon name="sparkle" size={20} color={colors.onAccent} />
          <T weight="extrabold" style={{ fontSize: 17, color: colors.onAccent }}>{t("choose.start")}</T>
        </Pressable>
      </View>

      <Pressable testID="choose-self" accessibilityRole="button" disabled={opening} onPress={() => void designMyself()} style={({ pressed }) => ({ ...surfaceCard(24), flexDirection: "row", alignItems: "center", gap: 14, padding: 16, opacity: pressed || opening ? 0.8 : 1 })}>
        <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="palette" size={24} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("choose.selfTitle")}</T>
          <T style={{ fontSize: 14.5, lineHeight: 20, color: colors.inkSoft }}>{opening ? t("choose.opening") : t("choose.selfBody")}</T>
        </View>
        <AppIcon name="chevron" size={20} color={colors.inkSoft} />
      </Pressable>

      {products ? (
        <View style={{ ...surfaceCard(22), flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
          <View style={{ backgroundColor: colors.peach, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T weight="extrabold" style={{ color: colors.accentInk, fontSize: 14 }}>{t("choose.products", { count: products })}</T>
          </View>
          <T style={{ flex: 1, fontSize: 14.5, color: colors.inkSoft }}>{t("choose.productsHave")}</T>
        </View>
      ) : null}
    </RexFrame>
  );
}
