import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Banner, Eyebrow, Small } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { LinkButton, Mascot, Notice, PillButton, T } from "@/components/ui";
import { fetchSetup } from "@/lib/setup";
import { applyLook, fetchLooks, lookImage, recommendLook, type ShopLook } from "@/lib/templates";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Shop looks ("Familiar app" prototype `on.templates` and `tplView`), in the app instead of the web-only Themes
// page: "Build with Rex or pick a look", Ask Rex to build it, Rex's pick for what the shop sells, then every look
// as a card in its own colours. A look opens a sheet: what it is, "Use this look" (POST /api/store/templates/apply;
// a live shop keeps its look until it's published), then Preview opens the shop's draft in the in-app browser.

function LookCard({ look, shopName, picked, onPress }: { look: ShopLook; shopName: string; picked: boolean; onPress: () => void }) {
  const t = useT("m_shop");
  const tokens = look.themeTokens;
  const image = lookImage(look.previewImage);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${look.name}. ${look.description}`}
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 24, borderWidth: picked ? 2.5 : 1, borderColor: picked ? colors.ink : colors.line, overflow: "hidden", opacity: pressed ? 0.9 : 1 })}
    >
      <View style={{ height: 120, backgroundColor: tokens?.heroBg ?? colors.lilac, alignItems: "center", justifyContent: "center", padding: 14 }}>
        {image ? <Image source={{ uri: image }} style={{ position: "absolute", inset: 0 }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        {!image ? (
          <>
            <T numberOfLines={1} style={{ fontFamily: tokens?.headingStyle === "serif" ? fonts.displayBold : fonts.display, fontSize: 18, letterSpacing: 1.5, textTransform: "uppercase", color: tokens?.heroText ?? colors.ink }}>{shopName}</T>
            <View style={{ marginTop: 10, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: tokens?.ctaBg ?? colors.ink }}>
              <T weight="bold" style={{ fontSize: 12, color: tokens?.ctaText ?? "#FFFFFF" }}>{t("looks.shopNow")}</T>
            </View>
          </>
        ) : null}
      </View>
      <View style={{ padding: 14, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{look.name}</T>
          {look.category ? <Small>{look.category}</Small> : null}
        </View>
        <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }} numberOfLines={2}>{look.description}</T>
      </View>
    </Pressable>
  );
}

export default function ShopLooks() {
  const t = useT("m_shop", "common");
  const loaded = useLoad(async () => {
    const [looks, setup] = await Promise.all([fetchLooks(), fetchSetup().catch(() => null)]);
    return { looks: looks?.templates ?? null, store: setup?.store ?? null };
  });
  const pick = useLoad(() => recommendLook().catch(() => null));
  const [open, setOpen] = useState<ShopLook | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<{ id: string; slug: string; draftOnly: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const looks = loaded.data?.looks ?? null;
  const store = loaded.data?.store ?? null;
  const shopName = store?.name ?? "";
  const recommended = pick.data && looks ? looks.find((look) => look.id === pick.data!.themeId) ?? null : null;
  // Rex's pick first, then the rest as the server orders them.
  const ordered = looks ? (recommended ? [recommended, ...looks.filter((look) => look.id !== recommended.id)] : looks) : [];

  async function use(look: ShopLook) {
    setBusy(true);
    setError(null);
    try {
      const result = await applyLook(look.id);
      setApplied({ id: look.id, slug: result.storeSlug, draftOnly: result.draftOnly });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : t("looks.applyFailed"));
    } finally {
      setBusy(false);
    }
  }

  const preview = (slug: string | null | undefined) => (slug ? void openWeb(`/s/${encodeURIComponent(slug)}/preview`) : undefined);
  const askRex = (prompt: string) => router.push({ pathname: "/rex", params: { prompt } });

  return (
    <Screen title={t("looks.title")} heading={t("looks.heading")} sub={t("looks.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      <Pressable
        accessibilityRole="button"
        onPress={() => askRex(t("looks.rexPrompt"))}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.ink, borderRadius: 24, padding: 16, minHeight: 72, opacity: pressed ? 0.9 : 1 })}
      >
        <Mascot name="rex" size={44} label="" />
        <T weight="extrabold" style={{ flex: 1, fontSize: 16, color: "#FFFFFF" }}>{t("looks.askRex")}</T>
        <AppIcon name="chevron" size={18} color="#FFFFFF" />
      </Pressable>

      {store?.slug ? <LinkButton title={t("looks.previewMine")} onPress={() => preview(store.slug)} /> : null}

      {recommended && pick.data ? (
        <Banner tone="peach" icon="sparkle" title={t("looks.rexPicks", { name: recommended.name })}>
          {pick.data.reason}
        </Banner>
      ) : null}

      {loaded.loading && !loaded.data ? <LoadingBlock /> : null}
      {loaded.error && !loaded.data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {loaded.data && !ordered.length ? (
        <EmptyState icon="image" title={t("looks.noneTitle")}>{t("looks.noneBody")}</EmptyState>
      ) : null}

      {ordered.length ? (
        <View style={{ gap: 12 }}>
          <Eyebrow>{t("looks.templates")}</Eyebrow>
          {ordered.map((look) => (
            <LookCard
              key={look.id}
              look={look}
              shopName={shopName || look.name}
              picked={applied?.id === look.id}
              onPress={() => {
                setError(null);
                setOpen(look);
              }}
            />
          ))}
        </View>
      ) : null}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""}>
        {open ? (
          <View style={{ gap: 12 }}>
            <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("looks.keeps", { description: open.description.replace(/[.\s]+$/, "") })}</T>
            {error ? <Notice>{error}</Notice> : null}
            {applied?.id === open.id ? (
              <>
                <Notice tone="success">{applied.draftOnly ? t("looks.appliedDraft") : t("looks.applied")}</Notice>
                <PillButton testID="look-preview" title={t("looks.preview")} onPress={() => preview(applied.slug)} />
                {applied.draftOnly ? <LinkButton title={t("looks.publish")} onPress={() => void openWeb("/builder/editor")} /> : null}
              </>
            ) : (
              <PillButton testID="look-use" tone="accent" title={t("looks.use")} busy={busy} onPress={() => void use(open)} />
            )}
            <LinkButton
              title={t("looks.askRexChange")}
              onPress={() => {
                const name = open.name;
                setOpen(null);
                askRex(t("looks.rexChangePrompt", { name }));
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
