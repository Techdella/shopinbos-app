import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Pill } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BoardScreen } from "@/components/Screen";
import { GoalList } from "@/components/supplier/DropshipKit";
import { Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { applyToBeFeatured, fetchPartnerLevel, type PartnerLevelView } from "@/lib/logistics";
import { LEVEL_KEYS, levelIndex, tierUnlocks, type LevelKey } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Your level (the web's /logistics/level): the partner's reach tier, Tier 1 Verified → Tier 2 Trusted → Tier 3 Top
// partner (shared/partner-reach.ts). Tiers control reach, not cash: the forest card says where they are, then what's
// left to the next tier (meters), "Apply to be featured" for Top partners, why interstate jobs don't come yet below
// Trusted, and what each tier unlocks (Top partners: paid even on failed trips). No cash cap here. GET /api/mobile/logistics/level,
// POST …/level/featured. Opened from More, Services and the Jobs tab.

function FeaturedBox({ data, onApplied }: { data: PartnerLevelView; onApplied: () => void }) {
  const t = useT("m_partner", "common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const top = data.level === "cash_trusted";
  const status = data.featuredStatus ?? "none";
  const line = data.featuredNow ? t("lvl.featuredOn") : !top ? t("lvl.featuredLocked") : status === "applied" ? t("lvl.featuredApplied") : status === "rejected" ? t("lvl.featuredRejected") : t("lvl.featuredSub");

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await applyToBeFeatured();
      onApplied();
    } catch (applyError) {
      setError(applyError instanceof ApiError || applyError instanceof Error ? applyError.message : t("error.retry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: data.featuredNow ? colors.mintTint : colors.grayTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={top ? "star" : "lock"} size={18} color={data.featuredNow ? colors.forest : colors.grayInk} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("lvl.featuredTitle")}</T>
          <T style={{ fontSize: 13.5, lineHeight: 19, color: colors.inkSoft }}>{line}</T>
        </View>
      </View>
      {status === "rejected" && data.featuredNote ? <T style={{ fontSize: 13, lineHeight: 18 }}>“{data.featuredNote}”</T> : null}
      {error ? <Notice>{error}</Notice> : null}
      {top && !data.featuredNow && status !== "applied" ? <PillButton tone="forest" icon="star" title={t("lvl.apply")} busy={busy} onPress={() => void apply()} /> : null}
    </View>
  );
}

/** What each tier unlocks: a card per tier, ticks up to theirs, locks above. */
function Unlocks({ data }: { data: PartnerLevelView }) {
  const t = useT("m_partner", "common");
  const at = levelIndex(data.level);
  return (
    <View style={{ gap: 10 }}>
      <T style={{ fontFamily: fonts.display, fontSize: 18 }} accessibilityRole="header">{t("lvl.unlocksTitle")}</T>
      {LEVEL_KEYS.map((key, index) => {
        const open = index <= at;
        const here = index === at;
        return (
          <View key={key} accessibilityLabel={`${t.dynamic(`lvl.tier.${key}`)}. ${here ? t("lvl.here") : open ? t("lvl.unlocked") : t("lvl.locked")}`} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 8, borderWidth: here ? 2 : 1, borderColor: here ? colors.forest : colors.line }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="extrabold" style={{ flex: 1, fontSize: 15.5 }}>{t.dynamic(`lvl.tier.${key}`)}</T>
              <Pill label={here ? t("lvl.here") : open ? t("lvl.unlocked") : t("lvl.locked")} tone={here ? "teal" : open ? "ok" : "gray"} icon={open ? undefined : "lock"} />
            </View>
            <T style={{ fontSize: 12.5, lineHeight: 17, color: colors.inkSoft }}>{t.dynamic(`lvl.needs.${key}`)}</T>
            {tierUnlocks(key).map((unlock) => (
              <View key={unlock} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: open ? colors.mintTint : colors.grayTint, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <AppIcon name={open ? "check" : "lock"} size={11} color={open ? colors.forest : colors.grayInk} />
                </View>
                <T style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                  {t.dynamic(`lvl.unlock.${unlock}`)}
                  {unlock === "fasterPayouts" && !data.fasterPayoutsLive ? <T weight="bold" style={{ fontSize: 12.5, color: colors.inkSoft }}>{`  ·  ${t("lvl.comingSoon")}`}</T> : null}
                </T>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default function PartnerLevelScreen() {
  const t = useT("m_partner", "common");
  const level = useLoad(fetchPartnerLevel);
  const data = level.data;
  const key: LevelKey = data?.level ?? "verified";
  const at = levelIndex(key);

  return (
    <BoardScreen title={t("lvl.title")} gap={12} refreshing={level.refreshing} onRefresh={() => void level.refresh()} fallback="/logistics/more">
      {level.loading && !data ? <LoadingBlock /> : null}
      {level.error && !data ? <ErrorState message={level.error} onRetry={() => void level.reload()} /> : null}
      {data ? (
        <>
          <View style={{ backgroundColor: colors.forest, borderRadius: 24, padding: 18, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 6 }} accessible accessibilityLabel={t("lvl.ladder", { name: t.dynamic(`lvl.tier.${key}`), at: at + 1 })}>
              {LEVEL_KEYS.map((step, index) => (
                <View key={step} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: index < at ? "#7FD3C3" : index === at ? "#FFFFFF" : "rgba(255,255,255,0.2)" }} />
                  <T weight="extrabold" numberOfLines={1} style={{ fontSize: 10.5, letterSpacing: 0.3, color: index <= at ? "#FFFFFF" : "rgba(255,255,255,0.55)" }}>{t.dynamic(`lvl.short.${step}`)}</T>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <T style={{ fontFamily: fonts.display, fontSize: 25, lineHeight: 29, color: "#FFFFFF" }} accessibilityRole="header">{t("lvl.youAre", { name: t.dynamic(`lvl.tier.${key}`) })}</T>
              {data.featuredNow ? <Pill label={t("lvl.featuredBadge")} tone="teal" icon="star" /> : null}
            </View>
            <T style={{ fontSize: 14, lineHeight: 20, color: "#D2EDE8" }}>{t.dynamic(`lvl.words.${key}`)}</T>
          </View>

          {data.interstateGated ? <Notice tone="info">{t("lvl.interstateGated")}</Notice> : null}

          <T style={{ fontFamily: fonts.display, fontSize: 18 }} accessibilityRole="header">{data.next ? t("lvl.next", { name: t.dynamic(`lvl.tier.${data.next}`) }) : t("lvl.top")}</T>
          {data.next && data.goals.length ? (
            <GoalList color={colors.forest} goals={data.goals} action={(goal) => (goal.key === "cac" ? { label: t("lvl.add"), onPress: () => router.push({ pathname: "/logistics/verification", params: { step: "cac" } }) } : null)} />
          ) : (
            <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("lvl.topSub")}</T>
          )}

          <FeaturedBox data={data} onApplied={() => void level.reload()} />
          <Unlocks data={data} />
          <T style={{ fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>{t("lvl.safetyNote")}</T>
        </>
      ) : null}
    </BoardScreen>
  );
}
