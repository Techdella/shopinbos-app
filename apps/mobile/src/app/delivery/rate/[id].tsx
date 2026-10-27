import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Banner, Heading, List, Row, Small, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { LinkButton, Notice, PillButton, T } from "@/components/ui";
import { answerPrivateRate, fetchDeliveryHub, fetchPartnerPage } from "@/lib/delivery";
import { daysWords, publicPriceFor, routeWords } from "@/lib/delivery-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// A partner's private rate for this business (the prototype's dvRate): each route with the public price it
// replaces, accept (new orders use it) or not now. Decline keeps their public rates.

function back() {
  if (router.canGoBack()) router.back();
  else router.replace("/delivery");
}

export default function PrivateRate() {
  const t = useT("m_delivery", "delivery", "common");
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useLoad(async () => {
    const hub = await fetchDeliveryHub();
    const card = hub.privateCards.find((entry) => entry.id === String(id)) ?? null;
    const page = card ? await fetchPartnerPage(card.partner.slug).catch(() => null) : null;
    return { card, publicRows: page?.card?.rows ?? [] };
  }, String(id));
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [taken, setTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = loaded.data?.card ?? null;

  async function answer(accept: boolean) {
    if (!card) return;
    setBusy(accept ? "accept" : "decline");
    setError(null);
    try {
      await answerPrivateRate(card.id, accept);
      if (accept) setTaken(true);
      else back();
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : t("saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (!card) {
    return (
      <Screen title={t("rate.title")}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
        {loaded.data && !card ? <Notice tone="info">{t("rate.gone")}</Notice> : null}
      </Screen>
    );
  }

  const waiting = card.status === "proposed" && !taken;
  return (
    <Screen
      title={t("rate.title")}
      footer={
        waiting ? (
          <>
            {error ? <Notice>{error}</Notice> : null}
            <PillButton tone="accent" busy={busy === "accept"} disabled={busy === "decline"} accessibilityLabel={t("rate.accept")} onPress={() => void answer(true)} icon="check" title={t("rate.accept")} />
            <PillButton title={t("rate.notNow")} tone="white" onPress={back} />
          </>
        ) : null
      }
    >
      <View style={{ gap: 8 }}>
        <Heading>{t("rate.heading", { name: card.partner.displayName })}</Heading>
        <Sub>{t("rate.sub")}</Sub>
      </View>
      <List>
        {card.rows.map((row) => {
          const was = publicPriceFor(row, loaded.data?.publicRows);
          return (
            <Row
              key={row.id}
              title={routeWords(row)}
              sub={was != null ? t("rate.was", { price: naira(was) }) : [t.dynamic(`service.${row.service}`, row.service), t(`size2.${row.sizeBand}`), daysWords(row.minDays, row.maxDays, t)].join(" · ")}
              right={<T weight="extrabold" style={{ fontSize: 18, color: colors.success }}>{naira(row.price)}</T>}
            />
          );
        })}
      </List>
      <Small>{t("rate.newOnly")}</Small>
      {taken || card.status === "accepted" ? <Banner tone="ok" title={t("rate.on")}>{t("rate.onSub")}</Banner> : null}
      {waiting ? <LinkButton title={busy === "decline" ? t("rate.declining") : t("mine.decline")} color={colors.danger} onPress={() => void answer(false)} /> : null}
    </Screen>
  );
}
