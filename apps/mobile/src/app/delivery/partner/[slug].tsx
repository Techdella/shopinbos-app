import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Banner, Eyebrow, List, Pill, Row, Small, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PartnerMark } from "@/components/seller/bits";
import { Notice, PillButton, T } from "@/components/ui";
import { connectPartner, fetchPartnerPage, openPartnerChat } from "@/lib/delivery";
import { coverageParts, daysWords, routeWords } from "@/lib/delivery-pure";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts, surfaceCard } from "@/theme";

// A delivery partner's page (the prototype's dvPartner): verified, rating and in-app stats, coverage and services,
// the public rate card with other fees and notes, pickup points, and Connect (instant, at their public rates) or
// their Delivery settings once connected. "Chat with them" opens the partner chat.

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View accessible accessibilityLabel={`${value} ${label}`} style={{ flex: 1, ...surfaceCard(), padding: 16, gap: 2 }}>
      <T style={{ fontFamily: fonts.display, fontSize: 20 }}>{value}</T>
      <Small>{label}</Small>
    </View>
  );
}

export default function PartnerPageScreen() {
  const t = useT("m_delivery", "delivery", "common");
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useLoad(() => fetchPartnerPage(String(slug)), String(slug));
  const { role } = useRole();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const data = page.data;

  async function connect() {
    if (!data) return;
    setBusy(true);
    setNote(null);
    try {
      await connectPartner(data.partner.id);
      await page.reload();
      setNote({ tone: "success", text: t("flash.partnerAdded") });
    } catch (connectError) {
      setNote({ tone: "error", text: connectError instanceof Error ? connectError.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Screen title={t("partner.title")}>
        {page.loading ? <LoadingBlock /> : null}
        {page.error ? <ErrorState message={page.error} onRetry={() => void page.reload()} /> : null}
      </Screen>
    );
  }

  const { partner, card, stats, connection, privateCard } = data;
  const cover = coverageParts(partner);
  const chat = () => openPartnerChat(role, { userId: partner.userId, name: partner.name });

  return (
    <Screen
      title={t("partner.title")}
      refreshing={page.refreshing}
      onRefresh={() => void page.refresh()}
      footer={
        <>
          {connection ? (
            <PillButton tone="accent" accessibilityLabel={t("partner.settings")} onPress={() => router.push({ pathname: "/delivery/connection/[id]", params: { id: connection.id } })} icon="settings" title={t("partner.settings")} />
          ) : (
            <PillButton tone="accent" busy={busy} accessibilityLabel={t("connect")} onPress={() => void connect()} icon="link" title={t("connect")} />
          )}
          <PillButton tone="white" accessibilityLabel={t("partner.chat")} onPress={chat} icon="chat" title={t("partner.chat")} />
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PartnerMark name={partner.name} logoUrl={partner.logoUrl} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <T weight="bold" style={{ fontSize: 21 }} accessibilityRole="header">{partner.name}</T>
          {partner.verified ? <Pill label={t("verified")} tone="ok" icon="check" /> : null}
        </View>
      </View>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {privateCard?.status === "proposed" ? (
        <List>
          <Row
          lead={<Tile icon="tag" tone="warn" />}
          title={t("hub.rateRow", { name: partner.name })}
          sub={t("hub.rateRowSub")}
            onPress={() => router.push({ pathname: "/delivery/rate/[id]", params: { id: privateCard.id } })}
          />
        </List>
      ) : null}
      {privateCard?.status === "accepted" ? <Banner tone="ok" title={t("rate.on")}>{t("rate.onSub")}</Banner> : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat value={partner.ratingCount > 0 ? `★ ${partner.rating.toFixed(1)}` : t("find.new")} label={t("partner.deliveries", { count: stats.completed })} />
          <Stat value={stats.onTimeRate === null ? "—" : `${stats.onTimeRate}%`} label={t("onTime")} />
          <Stat value={stats.failedRate === null ? "—" : `${stats.failedRate}%`} label={t("partner.failed")} />
        </View>
        <Small>{t("partner.statsNote")}</Small>
      </View>

      <List>
        <Row lead={<Tile icon="globe" tone="gray" />} title={t("partner.coverage")} sub={t("partner.coverageLine", { from: cover.from || "—", to: cover.to || "—" })} />
        <Row lead={<Tile icon="truck" tone="gray" />} title={t("services")} sub={partner.services.map((key) => t.dynamic(`service.${key}`, key)).join(" · ")} />
      </List>

      <Eyebrow>{t("partner.rateCard")}</Eyebrow>
      <List>
        {(card?.rows ?? []).map((row) => (
          <Row
            key={row.id}
            title={routeWords(row)}
            sub={[t.dynamic(`service.${row.service}`, row.service), t(`size2.${row.sizeBand}`), daysWords(row.minDays, row.maxDays, t)].join(" · ")}
            right={<T weight="bold" style={{ fontSize: 16 }}>{naira(row.price)}</T>}
          />
        ))}
        {!card?.rows.length ? <Row title={t("rates.none")} /> : null}
        {card ? (
          <Row
            title={t("partner.otherFees")}
            sub={t("partner.feesLine", { reattempt: card.failedAttemptFee ? naira(card.failedAttemptFee) : t("rates.noFee"), back: card.returnFee ? naira(card.returnFee) : t("rates.noFee") })}
          />
        ) : null}
        {card?.notes ? <Row title={t("partner.notes")} sub={card.notes} /> : null}
      </List>

      {partner.pickupPoints.length ? (
        <>
          <Eyebrow>{t("pickupPoints")}</Eyebrow>
          <List>
            {partner.pickupPoints.map((point) => (
              <Row
                key={point.id}
                lead={<Tile icon="pin" tone="mint" />}
                title={point.name}
                sub={
                  <View style={{ gap: 2 }}>
                    <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{point.address}</T>
                    {point.hours ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{point.hours}</T> : null}
                  </View>
                }
              />
            ))}
          </List>
        </>
      ) : null}
    </Screen>
  );
}
