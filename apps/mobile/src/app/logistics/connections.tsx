import { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { List, Row, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial, NoteCard } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { LinkButton, Notice, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { endMarketConnection, fetchMarket, setConnectionPod, type MarketConnectionRow } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Businesses you work with. Connecting is instant on your public prices (no request to accept), so this replaces
// the prototype's "Connection requests": each seller or supplier connected with you, pay on delivery for them (it
// shows at their checkout only when you both switch it on), a private rate, a chat, and ending the connection.

export default function Connections() {
  const t = useT("m_partner", "common");
  const market = useLoad(fetchMarket);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = market.data?.connections ?? [];

  async function pod(connection: MarketConnectionRow, on: boolean) {
    if (!market.data) return;
    setBusy(connection.id);
    setError(null);
    market.setData({ ...market.data, connections: list.map((row) => (row.id === connection.id ? { ...row, partnerPod: on } : row)) });
    try {
      await setConnectionPod(connection.id, on);
    } catch (podError) {
      setError(podError instanceof Error ? podError.message : t("error.retry"));
      void market.reload();
    } finally {
      setBusy(null);
    }
  }

  function end(connection: MarketConnectionRow) {
    Alert.alert(t("conn.endTitle", { name: connection.businessName }), t("conn.endBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("conn.end"),
        style: "destructive",
        onPress: () => {
          setBusy(connection.id);
          endMarketConnection(connection.id)
            .then(() => market.reload())
            .catch((endError: unknown) => setError(endError instanceof Error ? endError.message : t("error.retry")))
            .finally(() => setBusy(null));
        },
      },
    ]);
  }

  return (
    <Screen title={t("conn.title")} refreshing={market.refreshing} onRefresh={() => void market.refresh()}>
      <Sub>{t("conn.sub")}</Sub>
      {market.loading && !market.data ? <LoadingBlock /> : null}
      {market.error && !market.data ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
      {market.data && !list.length ? <NoteCard tone="mint" title={t("conn.none")}>{t("conn.noneBody")}</NoteCard> : null}
      {error ? <Notice>{error}</Notice> : null}
      {list.map((connection) => (
        <View key={connection.id} style={{ gap: 6 }}>
          <List>
            <Row
              lead={<Initial name={connection.businessName} bg={connection.ownerRole === "supplier" ? colors.blueTint : colors.peach} fg={connection.ownerRole === "supplier" ? colors.blueInk : colors.accentInk} />}
              title={connection.businessName}
              sub={t.dynamic(`chat.role.${connection.ownerRole}`, connection.ownerRole)}
              onPress={() => router.push({ pathname: "/logistics/chat/[id]", params: { id: connection.ownerUserId, name: connection.businessName, role: connection.ownerRole } })}
            />
            <Row
              title={t("conn.pod")}
              sub={connection.partnerPod && !connection.ownerPod ? t("conn.podWaiting", { name: connection.businessName }) : t("conn.podSub")}
              right={
                <View pointerEvents={busy === connection.id ? "none" : "auto"}>
                  <Toggle on={connection.partnerPod} onChange={(on) => void pod(connection, on)} label={t("conn.pod")} />
                </View>
              }
            />
            <Row title={t("chat.privateRate")} onPress={() => router.push({ pathname: "/logistics/private-rate", params: { ownerUserId: connection.ownerUserId, name: connection.businessName } })} />
          </List>
          <LinkButton title={t("conn.end")} color={colors.danger} onPress={() => end(connection)} />
        </View>
      ))}
    </Screen>
  );
}
