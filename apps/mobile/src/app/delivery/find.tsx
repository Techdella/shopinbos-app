import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Pill, Row, Seg, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PartnerMark } from "@/components/seller/bits";
import { T } from "@/components/ui";
import { findDeliveryPartners } from "@/lib/delivery";
import { timeframeWords, whereWords } from "@/lib/delivery-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Find partners (the prototype's dvFind): verified partners that pick up where the business ships from and cover
// where it sells, best first, with a filter by service. Tap one for their page.

const FILTERS = ["", "doorstep", "pickup_point", "same_day", "interstate"] as const;

export default function FindPartners() {
  const t = useT("m_delivery", "delivery", "common");
  const [service, setService] = useState<(typeof FILTERS)[number]>("");
  const found = useLoad(() => findDeliveryPartners({ service: service || null }), service);
  const data = found.data;

  return (
    <Screen title={t("find.title")} refreshing={found.refreshing} onRefresh={() => void found.refresh()}>
      {data ? <Sub>{t("find.sub", { where: whereWords(data, t) })}</Sub> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }}>
        <View style={{ width: 12 }} />
        {FILTERS.map((key) => <Seg key={key || "all"} label={t(`find.filter.${key || "all"}`)} on={service === key} onPress={() => setService(key)} />)}
        <View style={{ width: 12 }} />
      </ScrollView>
      {found.loading ? <LoadingBlock /> : null}
      {found.error && !data ? <ErrorState message={found.error} onRetry={() => void found.reload()} /> : null}
      {data && !found.loading ? (
        data.partners.length ? (
          <List>
            {data.partners.map((partner) => {
              const rating = partner.ratingCount > 0 ? `★ ${partner.rating.toFixed(1)}` : t("find.new");
              const parts = [rating, partner.startingPrice != null ? t("find.from", { price: naira(partner.startingPrice) }) : null, timeframeWords(partner.timeframe, t)].filter(Boolean);
              return (
                <Row
                  key={partner.id}
                  lead={<PartnerMark name={partner.name} logoUrl={partner.logoUrl} />}
                  title={partner.name}
                  sub={
                    <View style={{ gap: 2 }}>
                      {/* "Connected" under the name rather than beside it, so the details keep the row's width. */}
                      {partner.connectionId ? <Pill label={t("connected")} tone="ok" style={{ marginVertical: 2 }} /> : null}
                      <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{parts.join(" · ")}</T>
                      <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{partner.services.map((key) => t.dynamic(`service.${key}`, key)).join(" · ")}</T>
                    </View>
                  }
                  accessibilityLabel={`${partner.name}. ${parts.join(", ")}${partner.connectionId ? `. ${t("connected")}` : ""}`}
                  onPress={() => router.push({ pathname: "/delivery/partner/[slug]", params: { slug: partner.slug } })}
                />
              );
            })}
          </List>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
            <Sub>{t("find.empty")}</Sub>
          </View>
        )
      ) : null}
    </Screen>
  );
}
