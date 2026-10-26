import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Seg, Sub, Title } from "@/components/design";
import { FilterBar, FilterGroup, FilterSheet } from "@/components/FilterBar";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Chip, Field, LinkButton, Mascot, Notice, PillButton, T } from "@/components/ui";
import { ShopLiveSheet, usePublishShop } from "@/components/seller/PublishShop";
import { applyLook, fetchLookLibrary, lookDemoUrl, lookFilterCount, NO_LOOK_FILTERS, recommendLook, shownLooks, type LookFilters, type LookTone, type ShopLook } from "@/lib/templates";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { WebBadge } from "@/components/WebBadge";
import { ALL_THEMES_FREE } from "@shared/plans";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Shop looks ("Familiar app" prototype `on.templates` and `tplView`): the web gallery's themes (/builder/templates)
// as a grid of little shops in each theme's own colours and sample photos, filtered like the web (category chips,
// plus light or dark, search, "ones I can use" and "new" in the Filters sheet). A look opens full screen:
// a big preview, "See it live" (the theme's live demo with its sample store, in the in-app browser), "Use this
// look" (POST /api/store/templates/apply, the web's route) and "Ask Rex to change it". Every look is free while
// ALL_THEMES_FREE is on, so no lock shows at all; otherwise a look the plan doesn't include says "Not on your plan"
// and nothing more: no plan name, cost, upgrade link or website (app store payment rules,
// docs/store-payments-audit.md).

/** A little shop in the look's colours: its sample store's name, banner photo and two products. */
function MiniShop({ look, height, big = false }: { look: ShopLook; height: number; big?: boolean }) {
  const { bg, ink, accent } = look.preview;
  const [first, second] = look.demo.products;
  return (
    <View style={{ height, borderRadius: big ? 26 : 16, overflow: "hidden", backgroundColor: bg }}>
      <View style={{ height: big ? 40 : 26, justifyContent: "center", paddingHorizontal: big ? 14 : 8 }}>
        <T weight="extrabold" numberOfLines={1} style={{ fontSize: big ? 12 : 9, letterSpacing: 0.4, color: ink, textTransform: "uppercase" }}>{look.demo.storeName}</T>
      </View>
      <View style={{ height: big ? 170 : Math.round(height * 0.39), backgroundColor: accent }}>
        {look.demo.hero ? <Image source={{ uri: look.demo.hero }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
        {/* A dark scrim under the theme's name, so it reads on any photo. */}
        <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.62)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: big ? 90 : 48 }} />
        <T
          numberOfLines={1}
          style={{ position: "absolute", left: big ? 14 : 8, right: big ? 14 : 8, bottom: big ? 12 : 6, fontFamily: look.preview.nameFont === "serif" ? fonts.displayBold : fonts.display, fontSize: big ? 24 : 14, lineHeight: big ? 28 : 17, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 6 }}
        >
          {look.name}
        </T>
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: big ? 8 : 5, padding: big ? 10 : 6 }}>
        {[first, second].map((uri, index) => (
          <View key={index} style={{ flex: 1, borderRadius: big ? 12 : 7, overflow: "hidden", backgroundColor: look.preview.line }}>
            {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Tag({ label, dark, icon }: { label: string; dark?: boolean; icon?: "lock" | "check" | "sparkle" }) {
  const fg = dark ? "#FFFFFF" : colors.ink;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: dark ? colors.ink : "rgba(255,255,255,0.94)" }}>
      {icon ? <AppIcon name={icon} size={11} color={fg} strokeWidth={2.6} /> : null}
      <T weight="bold" style={{ fontSize: 11, color: fg }}>{label}</T>
    </View>
  );
}

function LookCard({ look, width, rexPick, onPress }: { look: ShopLook; width: number; rexPick: boolean; onPress: () => void }) {
  const t = useT("m_looks");
  const tb = useT("builder");
  const meaning = tb.dynamic(`theme.${look.id}.meaning`, look.meaning);
  return (
    <Pressable
      testID={`look-${look.id}`}
      accessibilityRole="button"
      accessibilityLabel={[look.name, meaning, look.current ? t("current") : null, look.lockedPlan ? t("notOnPlan") : null].filter(Boolean).join(". ")}
      onPress={onPress}
      style={({ pressed }) => ({ width, borderRadius: 22, padding: 8, gap: 8, backgroundColor: colors.surface, borderWidth: look.current ? 2.5 : 1, borderColor: look.current ? colors.ink : colors.line, opacity: pressed ? 0.88 : 1 })}
    >
      <View>
        <MiniShop look={look} height={200} />
        <View style={{ position: "absolute", left: 6, top: 30, right: 6, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {look.current ? <Tag label={t("current")} dark icon="check" /> : null}
          {rexPick && !look.current ? <Tag label={t("rexPick")} dark icon="sparkle" /> : null}
          {look.lockedPlan ? <Tag label={t("notOnPlan")} icon="lock" /> : null}
          {look.isNew && !look.current && !rexPick ? <Tag label={t("new")} /> : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: 6, paddingBottom: 4, gap: 2 }}>
        <T weight="extrabold" numberOfLines={1} style={{ fontSize: 14 }}>{look.name}</T>
        <T numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16, color: colors.inkSoft, minHeight: 32 }}>{meaning}</T>
      </View>
    </Pressable>
  );
}

type Applied = { id: string; slug: string; draftOnly: boolean; live: boolean };

/** Full-screen preview (`tplView`): the big shop, what it is, See it live, and Use this look or the plan it needs. */
function LookPreview({ look, rexReason, applied, onClose, onApplied }: { look: ShopLook; rexReason: string | null; applied: Applied | null; onClose: () => void; onApplied: (result: Applied) => void }) {
  const t = useT("m_looks");
  const tb = useT("builder");
  const tm = useT("m_shop");
  const [busy, setBusy] = useState<"use" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = applied?.id === look.id ? applied : null;
  const blurb = tb.dynamic(`theme.${look.id}.blurb`, look.blurb).replace(/[.\s]+$/, "");

  async function use() {
    setBusy("use");
    setError(null);
    try {
      const result = await applyLook(look.id);
      // A switched look only changes the draft: it's live once the seller publishes ("Put it live"), whether or not
      // the shop was live before (draftOnly only says shoppers still see the old look meanwhile).
      onApplied({ id: look.id, slug: result.storeSlug, draftOnly: result.draftOnly, live: false });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : t("applyFailed"));
    } finally {
      setBusy(null);
    }
  }

  const publishing = usePublishShop(() => done && onApplied({ ...done, live: true }));

  const askRex = () => {
    onClose();
    router.push({ pathname: "/rex", params: { prompt: t("rexChangePrompt", { name: look.name }) } });
  };

  const editShop = () => {
    onClose();
    router.push("/shop-edit" as never);
  };

  let action;
  if (done) {
    action = (
      <>
        <Notice tone="success">{done.live ? t("applied") : done.draftOnly ? t("appliedDraft") : t("appliedNew")}</Notice>
        {!done.live ? <PillButton testID="look-publish" tone="accent" title={t("putLive")} busy={publishing.busy} onPress={() => void publishing.publish()} /> : null}
        {publishing.error ? <Notice>{publishing.error}</Notice> : null}
        <PillButton testID="look-edit" tone="white" size="md" title={tm("editShop.open")} onPress={editShop} />
        {done.slug ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <LinkButton title={t("seeMyShop")} onPress={() => void openWeb(`/s/${encodeURIComponent(done.slug)}/preview`)} />
            <WebBadge />
          </View>
        ) : null}
        <ShopLiveSheet shop={publishing.live} onClose={publishing.closeLive} />
      </>
    );
  } else if (look.current) {
    action = (
      <>
        <Notice tone="info">{t("isCurrent")}</Notice>
        <PillButton testID="look-edit" tone="accent" title={tm("editShop.open")} onPress={editShop} />
      </>
    );
  } else if (look.lockedPlan) {
    action = (
      <>
        <Banner tone="warn" icon="lock" title={t("notOnPlan")} />
      </>
    );
  } else {
    action = <PillButton testID="look-use" tone="accent" title={t("use")} busy={busy === "use"} onPress={() => void use()} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScreenHeader title={t("previewTitle")} onBack={onClose} help={false} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16 }}>
        <MiniShop look={look} height={430} big />
        <View style={{ gap: 6 }}>
          <Title size={28}>{look.name}</Title>
          <Sub>{t("keeps", { blurb })}</Sub>
        </View>
        {rexReason ? <Banner tone="peach" icon="sparkle" title={t("rexPick")}>{rexReason}</Banner> : null}
        <PillButton testID="look-live" tone="white" size="md" accessibilityLabel={t("seeLive")} onPress={() => void WebBrowser.openBrowserAsync(lookDemoUrl(look))}>
          <AppIcon name="globe" size={18} />
          <T weight="bold" style={{ fontSize: 16 }}>{t("seeLive")}</T>
        </PillButton>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
        {error ? <Notice>{error}</Notice> : null}
        {action}
        <LinkButton title={t("askRexChange")} onPress={askRex} />
      </View>
    </SafeAreaView>
  );
}

export default function ShopLooks() {
  const t = useT("m_looks");
  const tb = useT("builder");
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 40 - 12) / 2);
  const loaded = useLoad(fetchLookLibrary);
  const library = loaded.data ?? null;
  // Rex's pick for what the shop sells: asked once per visit, shown first and on its card.
  const [pick, setPick] = useState<{ themeId: string; reason: string } | null>(null);
  useEffect(() => {
    let live = true;
    recommendLook()
      .then((answer) => {
        if (live && answer) setPick({ themeId: answer.themeId, reason: answer.reason });
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  const [category, setCategory] = useState("all");
  const [filters, setFilters] = useState<LookFilters>(NO_LOOK_FILTERS);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  // After a switch the new look is the current one, before the list reloads.
  const currentId = applied?.id ?? library?.currentThemeId ?? null;
  const withCurrent = useMemo(() => (library ? { ...library, looks: library.looks.map((look) => ({ ...look, current: look.id === currentId, lockedPlan: ALL_THEMES_FREE || look.id === currentId ? null : look.lockedPlan })) } : null), [library, currentId]);
  const looks = useMemo(() => shownLooks(withCurrent, category, filters, pick?.themeId ?? null), [withCurrent, category, filters, pick]);
  const opened = withCurrent?.looks.find((look) => look.id === open) ?? null;
  const set = (patch: Partial<LookFilters>) => setFilters((now) => ({ ...now, ...patch }));
  const clear = () => {
    setFilters(NO_LOOK_FILTERS);
    setCategory("all");
  };

  return (
    <Screen title={t("title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      <View style={{ backgroundColor: colors.mintTint, borderRadius: 24, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Mascot name="rex" size={44} label="" />
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{t("intro")}</T>
            <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("introSub")}</T>
          </View>
        </View>
        <PillButton testID="look-rex" title={t("letRex")} size="md" onPress={() => router.push({ pathname: "/rex", params: { prompt: t("rexPrompt") } })} />
      </View>

      {loaded.loading && !library ? <LoadingBlock /> : null}
      {loaded.error && !library ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {withCurrent?.looks.length ? (
        <>
          <FilterBar testID="look-filters" onMore={() => setSheet(true)} moreLabel={t("filters")} moreCount={lookFilterCount(filters)}>
            {withCurrent.chips.map((chip) => (
              <Seg key={chip} label={tb.dynamic(`chipf.${chip}`, chip)} on={category === chip} onPress={() => setCategory(chip)} />
            ))}
          </FilterBar>
          {looks.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {looks.map((look) => (
                <LookCard key={look.id} look={look} width={cardWidth} rexPick={pick?.themeId === look.id} onPress={() => setOpen(look.id)} />
              ))}
            </View>
          ) : (
            <EmptyState icon="search" title={t("noMatch")} action={<PillButton title={t("clear")} size="sm" tone="white" onPress={clear} />} />
          )}
        </>
      ) : null}

      <FilterSheet visible={sheet} onClose={() => setSheet(false)} title={t("filters")} doneLabel={t("showCount", { count: looks.length })} clearLabel={t("clear")} onClear={clear}>
        <Field value={filters.q} onChangeText={(q) => set({ q })} placeholder={t("search")} accessibilityLabel={t("search")} returnKeyType="search" autoCorrect={false} style={{ height: 48 }} />
        {/* No plan filter: plan names next to themes read as an upsell (app store payment rules). */}
        <FilterGroup label={t("colours")}>
          {(["all", "light", "dark"] as LookTone[]).map((tone) => (
            <Chip key={tone} label={t(`tone.${tone}`)} on={filters.tone === tone} onPress={() => set({ tone })} />
          ))}
        </FilterGroup>
        <FilterGroup label={t("show")}>
          {ALL_THEMES_FREE ? null : <Chip label={t("usable")} on={filters.usable} onPress={() => set({ usable: !filters.usable })} />}
          <Chip label={t("newOnes")} on={filters.isNew} onPress={() => set({ isNew: !filters.isNew })} />
        </FilterGroup>
      </FilterSheet>

      <Modal visible={!!opened} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpen(null)}>
        {opened ? (
          <LookPreview
            look={opened}
            rexReason={pick?.themeId === opened.id ? pick.reason : null}
            applied={applied}
            onClose={() => setOpen(null)}
            onApplied={(result) => setApplied(result)}
          />
        ) : null}
      </Modal>
    </Screen>
  );
}
