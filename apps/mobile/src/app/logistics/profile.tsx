import { View } from "react-native";
import { NATIONWIDE, startingPrice } from "@shared/delivery-market";
import { naira } from "@shared/onboarding";
import { Pill, Small, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { Card, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket } from "@/lib/logistics";
import { SERVICE_KEYS, stateLabel } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// "See your profile as sellers see it" ("Delivery partner app" prototype `profile`): the card sellers and suppliers
// find you by, built from your rating, rate card, coverage, services and pickup points.

export default function ProfilePreview() {
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  const data = market.data;

  let card = null;
  if (data) {
    const partner = data.partner;
    const rows = data.rateCard?.rows ?? [];
    const from = startingPrice(rows);
    const min = rows.length ? Math.min(...rows.map((row) => row.minDays)) : null;
    const max = rows.length ? Math.max(...rows.map((row) => row.maxDays)) : null;
    const time = max === null ? null : max <= 0 ? t("days.same") : min === max ? t("days.n", { count: max }) : t("days.range", { min: min ?? 0, max });
    const headline = [partner.ratingCount > 0 ? `★ ${partner.rating.toFixed(1)}` : null, from !== null ? t("profile.from", { price: naira(from) }) : null, time].filter(Boolean).join(" · ");
    const delivers = partner.deliveryAreas.includes(NATIONWIDE) ? t("profile.nationwide") : t("profile.deliversTo", { places: partner.deliveryAreas.map(stateLabel).join(", ") });
    const detail = [
      partner.pickupAreas.length ? t("profile.picksUp", { places: partner.pickupAreas.map(stateLabel).join(", ") }) : null,
      partner.deliveryAreas.length ? delivers : null,
      partner.services.map((service) => t.dynamic(SERVICE_KEYS[service] ?? service, service)).join(", ") || null,
      data.pickupPoints.length ? t("biz.pointsSub", { count: data.pickupPoints.length }) : null,
    ].filter(Boolean).join(" · ");
    card = (
      <Card style={{ padding: 20, gap: 12, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Initial name={partner.name} />
          <View style={{ flex: 1, gap: 3 }}>
            <T weight="bold" style={{ fontSize: 16 }}>{partner.name}</T>
            {headline ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{headline}</T> : null}
          </View>
          {partner.verificationStatus === "verified" ? <Pill tone="ok" label={t("verify.verified.label")} /> : null}
        </View>
        {detail ? <Small>{detail}</Small> : null}
      </Card>
    );
  }

  return (
    <Screen title={t("profile.title")} refreshing={market.refreshing} onRefresh={() => void market.refresh()}>
      <Sub>{t("profile.sub")}</Sub>
      {market.loading && !data ? <LoadingBlock /> : null}
      {market.error && !data ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
      {card}
      <Small>{t("profile.private")}</Small>
    </Screen>
  );
}
