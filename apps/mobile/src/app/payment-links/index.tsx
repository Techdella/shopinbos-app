import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { fetchPaymentLinks } from "@/lib/paylinks";
import { LINK_STATUS_COLORS as STATUS_COLORS } from "@/components/LinkShareButtons";
import { countByStatus, filterLinks, LINK_FILTERS, type LinkFilter } from "@/lib/paylinks-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Payment links (web /home/payment-links): every link with its status, amount, views and how often it was paid.
// Tap one to copy, share or cancel it; "New payment link" makes one for products in the shop.

export default function PaymentLinks() {
  const t = useT("m_paylinks", "m_ui");
  const [filter, setFilter] = useState<LinkFilter>("all");
  const links = useLoad(fetchPaymentLinks);
  const all = links.data?.links ?? [];
  const counts = countByStatus(all);
  const shown = filterLinks(all, filter);

  return (
    <Screen title={t("title")} sub={t("subShort")} tip={t("sub")} refreshing={links.refreshing} onRefresh={() => void links.refresh()}>
      <PillButton testID="new-payment-link" onPress={() => router.push("/payment-links/new")} accessibilityLabel={t("new")} icon="plus" title={t("new")} />

      {links.data && !links.data.readiness.ready ? (
        <View style={{ gap: 4 }}>
          <Notice tone="info">{t("notReady")}</Notice>
          <LinkButton title={t("setUpPayments")} onPress={() => router.push("/payments")} />
        </View>
      ) : null}

      {all.length ? (
        <ChipRow>
          {LINK_FILTERS.map((key) => (
            <Chip key={key} label={key === "all" || !counts[key] ? t(`filter.${key}`) : `${t(`filter.${key}`)} ${counts[key]}`} on={filter === key} onPress={() => setFilter(key)} />
          ))}
        </ChipRow>
      ) : null}

      {links.loading && !links.data ? <LoadingBlock /> : null}
      {links.error && !links.data ? <ErrorState message={links.error} onRetry={() => void links.reload()} /> : null}
      {links.data && !all.length ? (
        <EmptyState icon="link" title={t("empty.title")}>{t("empty.body")}</EmptyState>
      ) : null}
      {all.length && !shown.length ? <EmptyState icon="link" title={t("empty.nothing")} /> : null}

      {shown.map((link) => (
        <Pressable
          key={link.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/payment-links/[id]", params: { id: link.id } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Badge label={t(`status.${link.status}`)} bg={STATUS_COLORS[link.status].bg} fg={STATUS_COLORS[link.status].fg} />
              <T style={{ flex: 1, color: colors.inkSoft, fontSize: 13.5 }} numberOfLines={1}>
                {link.oneTime ? t("row.oneTime") : t("row.reusable")} · {t.dynamic(`by.${link.createdBy}`, link.createdBy)}
              </T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{link.title}</T>
              <T weight="extrabold" style={{ fontSize: 16 }}>{naira(link.amount)}</T>
            </View>
            <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={2}>
              {[
                friendlyDay(link.createdAt, new Date(), t),
                link.buyerName ? t("row.for", { name: link.buyerName }) : null,
                t("row.views", { count: link.views }),
                link.paidCount ? t("row.paidTimes", { count: link.paidCount }) : null,
              ].filter(Boolean).join(" · ")}
            </T>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
