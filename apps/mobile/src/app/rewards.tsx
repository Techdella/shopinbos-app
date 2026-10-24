import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BigNumber, Eyebrow, List, Pill, Row, Small, TILE, Tile, Title } from "@/components/design";
import { ReferCard } from "@/components/familiar/ReferCard";
import { AppIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { Mascot, Notice, PillButton, T } from "@/components/ui";
import { claimChallenge, fetchRewards, levelProgress, swapPoints } from "@/lib/familiar";
import { familiarRole } from "@/lib/familiar-pure";
import { formatDate } from "@shared/i18n";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Rewards for sellers, suppliers and delivery partners ("Familiar app" prototype `rewards`): the level with a ring,
// the streak and points, this week's challenges with Claim, badges, and swapping points for Rex credits. Points
// are never money ("Points can't be turned into cash"). GET/POST /api/mobile/rewards; no answer shows the
// normal error with Retry.

function LevelRing({ level, progress }: { level: number; progress: number }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(22,20,31,0.12)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ink} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${length * progress} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <T style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 36 }}>{level}</T>
    </View>
  );
}

const BADGE_TONES = ["lime", "peach", "sky", "lilac", "butter", "mint"] as const;

export default function Rewards() {
  const t = useT("m_familiar");
  const locale = useLocale();
  const { role } = useRole();
  const who = familiarRole(role);
  const rewards = useLoad(fetchRewards);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const data = rewards.data;

  const claim = async (key: string) => {
    setClaiming(key);
    setProblem(null);
    try {
      rewards.setData(await claimChallenge(key));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("rw.failed"));
    } finally {
      setClaiming(null);
    }
  };

  const swap = async () => {
    setSwapping(true);
    setProblem(null);
    try {
      const result = await swapPoints();
      rewards.setData(result.rewards);
      setAdded(result.creditsAdded);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("rw.failed"));
    } finally {
      setSwapping(false);
    }
  };

  const perk = who === "logistics_partner" ? t("rw.perkPartner") : t("rw.perk");

  return (
    <Screen title={t("rw.title")} refreshing={rewards.refreshing} onRefresh={() => void rewards.refresh()}>
      {rewards.loading && !data ? <LoadingBlock /> : null}
      {rewards.error && !data ? <ErrorState message={rewards.error} onRetry={() => void rewards.reload()} /> : null}
      {!rewards.loading && !rewards.error && !data ? <ErrorState message={t("rw.loadFailed")} onRetry={() => void rewards.reload()} /> : null}

      {data ? (
        <>
          <View style={{ backgroundColor: TILE.lime.bg, borderRadius: 24, padding: 20, flexDirection: "row", alignItems: "center", gap: 16 }} accessible accessibilityLabel={t("rw.levelLabel", { level: data.level, name: data.levelName })}>
            <LevelRing level={data.level} progress={levelProgress(data)} />
            <View style={{ flex: 1, gap: 4 }}>
              <Pill label={t("rw.level", { level: data.level })} tone="gray" style={{ backgroundColor: "rgba(255,255,255,0.7)" }} />
              <Title size={24}>{data.levelName}</Title>
              {data.xpForNext ? <Small style={{ color: colors.ink }}>{t("rw.xp", { xp: data.xp, next: data.xpForNext })}</Small> : null}
              {data.nextLevelName ? <Small style={{ color: colors.ink }}>{t("rw.next", { name: data.nextLevelName })}</Small> : <Small style={{ color: colors.ink }}>{t("rw.top")}</Small>}
            </View>
          </View>

          <ReferCard />

          {data.loyalty ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 8 }} accessible accessibilityLabel={t("rw.tier", { tier: data.loyalty.tierName })}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: data.loyalty.color }} />
                <Title size={20}>{t("rw.tier", { tier: data.loyalty.tierName })}</Title>
                {data.loyalty.founding ? <Pill label={t("rw.founding")} tone="ok" icon="star" /> : null}
              </View>
              {data.loyalty.perks.map((perkText) => (
                <Small key={perkText} style={{ color: colors.ink }}>• {perkText}</Small>
              ))}
              <Small>{data.loyalty.next ? t("rw.tierNext", { level: data.loyalty.next.atLevel, tier: data.loyalty.next.tierName, credits: data.loyalty.next.monthlyCredits }) : t("rw.tierTop")}</Small>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, backgroundColor: TILE.peach.bg, borderRadius: 24, padding: 18, gap: 2 }} accessible accessibilityLabel={t("rw.streakLabel", { count: data.streak })}>
              <BigNumber size={38}>{data.streak}</BigNumber>
              <Small style={{ color: colors.ink }}>{t("rw.streak")}</Small>
            </View>
            <View style={{ flex: 1, backgroundColor: TILE.sky.bg, borderRadius: 24, padding: 18, gap: 2 }} accessible accessibilityLabel={t("rw.pointsLabel", { count: data.points })}>
              <BigNumber size={38}>{data.points}</BigNumber>
              <Small style={{ color: colors.ink }}>{t("rw.points")}</Small>
            </View>
          </View>

          {data.challenges.length ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Eyebrow>{t("rw.week")}</Eyebrow>
                {data.resetsAt ? <Small>{t("rw.resets", { day: formatDate(data.resetsAt, locale, { weekday: "long" }) })}</Small> : null}
              </View>
              <List>
                {data.challenges.map((challenge) => {
                  const share = challenge.target ? Math.min(1, challenge.progress / challenge.target) : 0;
                  return (
                    <Row
                      key={challenge.key}
                      lead={<Tile icon={challenge.claimed ? "check" : "star"} tone="butter" />}
                      title={
                        <View style={{ gap: 4 }}>
                          <T weight="bold" style={{ fontSize: 16, lineHeight: 21 }}>{challenge.title}</T>
                          <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("rw.progress", { have: Math.min(challenge.progress, challenge.target), need: challenge.target, points: challenge.points })}</T>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.grayTint, overflow: "hidden" }} accessibilityLabel={t("rw.progressLabel", { have: challenge.progress, need: challenge.target })}>
                            <View style={{ width: `${share * 100}%`, height: 6, backgroundColor: colors.accent }} />
                          </View>
                        </View>
                      }
                      right={
                        challenge.claimed ? (
                          <Pill label={t("rw.gotIt")} tone="ok" icon="check" />
                        ) : challenge.claimable ? (
                          <PillButton title={t("rw.claim")} tone="accent" size="sm" busy={claiming === challenge.key} accessibilityLabel={t("rw.claimLabel", { title: challenge.title, points: challenge.points })} onPress={() => void claim(challenge.key)} />
                        ) : null
                      }
                    />
                  );
                })}
              </List>
            </View>
          ) : null}

          {data.badges.length ? (
            <View style={{ gap: 10 }}>
              <Eyebrow>{t("rw.badges")}</Eyebrow>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {data.badges.map((badge, index) => {
                  const tone = TILE[BADGE_TONES[index % BADGE_TONES.length]];
                  return (
                    <View
                      key={badge.key}
                      accessible
                      accessibilityLabel={badge.earned ? t("rw.badgeEarned", { title: badge.title }) : t("rw.badgeLocked", { title: badge.title })}
                      style={{ width: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 12, opacity: badge.earned ? 1 : 0.5 }}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: badge.earned ? tone.bg : colors.grayTint, alignItems: "center", justifyContent: "center" }}>
                        <AppIcon name={badge.earned ? "star" : "clock"} size={18} color={colors.ink} />
                      </View>
                      <T weight="bold" style={{ flex: 1, fontSize: 14, lineHeight: 18 }} numberOfLines={2}>{badge.title}</T>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <List>
            <Row
              lead={<Mascot who="rex" size={44} label="" />}
              title={t("rw.swapTitle", { points: data.swap.points, credits: data.swap.credits })}
              sub={added ? t("rw.swapDone", { count: added }) : data.swap.canSwap ? t("rw.swapSub") : t("rw.swapNeed", { points: data.swap.points })}
              right={
                added ? (
                  <Pill label={t("rw.done")} tone="ok" icon="check" />
                ) : (
                  <PillButton title={t("rw.swap")} tone="accent" size="sm" busy={swapping} disabled={!data.swap.canSwap} accessibilityLabel={t("rw.swapTitle", { points: data.swap.points, credits: data.swap.credits })} onPress={() => void swap()} />
                )
              }
            />
          </List>

          {problem ? <Notice>{problem}</Notice> : null}
          <Small>{t("rw.noCash")} {perk}</Small>
        </>
      ) : null}
    </Screen>
  );
}
