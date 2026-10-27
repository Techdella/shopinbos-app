import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { TonePill } from "@/components/partner";
import { Card, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchKyc } from "@/lib/kyc";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// The delivery partner's tier on Jobs: Verified Individual or Registered Business, the badges, the Tier 1 limits and
// how close they are to lifting them ("12 / 20 deliveries"), and the way to Registered Business. Hidden until the
// partner is verified (the verification card above Jobs covers the time before).
export function TierCard() {
  const t = useT("m_kyc");
  const kyc = useLoad(fetchKyc);
  const data = kyc.data;
  if (!data || (data.state !== "tier1_verified" && data.state !== "tier2_verified")) return null;
  const tier2 = data.state === "tier2_verified";
  const { limits } = data;
  const progress = limits.progress;
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{tier2 ? t("tier.tier2") : t("tier.tier1")}</T>
        <TonePill tone="success" label={t("tier.verified")} />
      </View>
      {data.badges.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {data.badges.map((badge) => <TonePill key={badge} tone="info" label={t.dynamic(`badge.${badge}`, badge)} />)}
        </View>
      ) : null}
      {limits.limited ? (
        <View style={{ gap: 4 }}>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("tier.limits", { value: naira(limits.rules.maxOrderValue), count: limits.rules.maxActiveOrders })}</T>
          <T weight="bold" style={{ fontSize: 14 }}>{t("tier.toLift")}</T>
          <T style={{ fontSize: 14 }}>{t("tier.deliveries", { have: progress.deliveries.have, need: progress.deliveries.need })}</T>
          <T style={{ fontSize: 14 }}>{t("tier.rating", { have: progress.rating.have.toFixed(1), need: progress.rating.need.toFixed(1) })}</T>
          <T style={{ fontSize: 14 }}>{t("tier.disputes", { have: progress.disputeRate.have, max: progress.disputeRate.max })}</T>
        </View>
      ) : (
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("tier.noLimits")}</T>
      )}
      {!tier2 ? <PillButton title={t("tier.upgrade")} size="sm" tone="white" style={{ alignSelf: "flex-start" }} onPress={() => router.push({ pathname: "/logistics/verification", params: { step: "cac" } })} /> : null}
    </Card>
  );
}
