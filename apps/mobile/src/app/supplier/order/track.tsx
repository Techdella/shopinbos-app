import { Linking, Share, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { List, Pill, Row, Sub, Tile, Timeline } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PillButton, T } from "@/components/ui";
import { fetchSupplierTrack } from "@/lib/familiar";
import { capitalise, friendlyTime } from "@/lib/friendly";
import { useT } from "@/lib/i18n";
import { openSupportWhatsApp } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Track a supplier order ("Familiar app" supplier prototype `track`): where the parcel is (a status pill and the
// title), from → to, the delivery partner and when it should arrive, the timeline, "Call {partner}" and "Report a
// problem" (chat with Shopinbos), and the one main button "Share with {shop}", which sends the shop's own
// tracking page (their storefront order link, unguessable) through the phone's share sheet. The tracking comes
// from GET /api/mobile/supplier/orders/[id]/track; when the server doesn't have it (404) the screen says so.

export default function SupplierTrack() {
  const { id, kind, shop, ref } = useLocalSearchParams<{ id: string; kind?: string; shop?: string; ref?: string }>();
  const t = useT("m_supplier", "delivery", "m_ui", "common");
  const orderKind = kind === "wholesale" ? "wholesale" : "dropship";
  const track = useLoad(() => fetchSupplierTrack(String(id), orderKind), `${orderKind}:${id}`);
  const data = track.data;
  const shopName = shop || t("track.theShop");

  async function share(url: string) {
    await Share.share({ message: t("track.shareMsg", { shop: shopName, url }), url }).catch(() => null);
  }

  async function report() {
    const text = `Hello Shopinbos, I have a problem with the delivery of order ${ref || id}.`;
    if (!(await openSupportWhatsApp(text))) router.push("/help/chat");
  }

  const footer = data?.shareUrl ? (
    <PillButton tone="accent" onPress={() => void share(data.shareUrl!)} accessibilityLabel={t("track.share", { shop: shopName })} icon="share" title={t("track.share", { shop: shopName })} />
  ) : undefined;

  return (
    <Screen title={t("track.title")} refreshing={track.refreshing} onRefresh={() => void track.refresh()} footer={footer}>
      {track.loading && !data ? <LoadingBlock /> : null}
      {track.error && !data ? <ErrorState message={track.error} onRetry={() => void track.reload()} /> : null}
      {!track.loading && !track.error && !data ? <Sub>{t("track.none")}</Sub> : null}

      {data ? (
        <>
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pill label={t.dynamic(`status.${data.status}`, data.status.replace(/_/g, " "))} tone="org" />
              {ref ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{ref}</T> : null}
            </View>
            <T weight="extrabold" style={{ fontSize: 19, lineHeight: 24 }}>{data.title}</T>
            <View accessible accessibilityLabel={t("track.fromTo", { from: data.from, to: data.to })} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
              <T weight="semibold" style={{ fontSize: 15, flexShrink: 1 }} numberOfLines={1}>{data.from}</T>
              <View style={{ flex: 1, minWidth: 16, height: 2, backgroundColor: colors.line }} />
              <T weight="semibold" style={{ fontSize: 15, flexShrink: 1 }} numberOfLines={1}>{data.to}</T>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
            </View>
            {data.partner || data.eta ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{[data.partner?.name, data.eta ? capitalise(friendlyTime(data.eta, new Date(), t)) : null].filter(Boolean).join(" · ")}</T> : null}
          </View>

          {data.timeline.length ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
              <Timeline steps={data.timeline.map((step) => ({ ...step, at: step.at ? capitalise(friendlyTime(step.at, new Date(), t)) : null }))} />
            </View>
          ) : null}

          <List>
            {data.partner?.phone ? (
              <Row lead={<Tile icon="phone" tone="mint" />} title={t("track.call", { name: data.partner.name })} onPress={() => void Linking.openURL(`tel:${data.partner!.phone}`)} />
            ) : null}
            <Row lead={<Tile icon="chat" tone="warn" />} title={t("track.report")} sub={t("track.reportSub")} onPress={() => void report()} />
          </List>
        </>
      ) : null}
    </Screen>
  );
}
