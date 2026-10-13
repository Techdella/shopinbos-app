import { useState } from "react";
import { Linking, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { fetchReviewRequests, makeReviewLink } from "@/lib/reviews";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Ask for reviews from your own phone: each recent order gets a signed link where the buyer rates every item
// (no sign-in), shared on WhatsApp or anywhere. Email and SMS requests in the store's name are on the web.

export default function AskForReviews() {
  const t = useT("m_reviews", "m_ui", "common");
  const data = useLoad(fetchReviewRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function ask(orderId: string, via: "share" | "whatsapp") {
    setBusy(`${via}:${orderId}`);
    setNote(null);
    try {
      const result = await makeReviewLink(orderId);
      if (via === "whatsapp" && result.whatsappUrl) await Linking.openURL(result.whatsappUrl);
      else await Share.share({ message: result.message });
    } catch (askError) {
      setNote({ tone: "error", text: askError instanceof Error ? askError.message : t("askScreen.linkFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function copyWall(wall: string) {
    await Clipboard.setStringAsync(wall);
    setNote({ tone: "success", text: t("askScreen.wallCopied") });
  }

  return (
    <Screen title={t("ask")} sub={t("askScreen.sub")} refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {data.loading && !data.data ? <LoadingBlock /> : null}
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={() => void data.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/reviews/request") }} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {data.data ? (
        <>
          <Card style={{ gap: 10 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{t("askScreen.wall")}</T>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t("askScreen.wallBody")}</T>
            <T weight="semibold" style={{ fontSize: 14 }} selectable numberOfLines={1}>{data.data.wall}</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PillButton title={t("share")} size="sm" style={{ flex: 1 }} onPress={() => void Share.share({ message: t("askScreen.wallMessage", { url: data.data!.wall }) })} />
              <PillButton title={t("askScreen.copyLink")} size="sm" tone="white" style={{ flex: 1 }} onPress={() => void copyWall(data.data!.wall)} />
            </View>
          </Card>

          <SectionTitle>{t("askScreen.recent")}</SectionTitle>
          {!data.data.orders.length ? <EmptyState icon="bag" title={t("askScreen.emptyTitle")}>{t("askScreen.emptyBody")}</EmptyState> : null}
          {data.data.orders.map((order) => (
            <Card key={order.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{order.customerName}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>#{order.orderNumber} · {t.dynamic(`status.${order.status}`, order.status.charAt(0).toUpperCase() + order.status.slice(1))} · {shortTime(order.at, new Date(), t)}</T>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {order.hasPhone ? <PillButton title="WhatsApp" size="sm" tone="forest" style={{ flex: 1 }} busy={busy === `whatsapp:${order.id}`} disabled={busy !== null} onPress={() => void ask(order.id, "whatsapp")} /> : null}
                <PillButton title={t("askScreen.shareLink")} size="sm" tone="white" style={{ flex: 1 }} busy={busy === `share:${order.id}`} disabled={busy !== null} onPress={() => void ask(order.id, "share")} />
              </View>
            </Card>
          ))}
          <PillButton title={t("askScreen.web")} tone="white" size="md" onPress={() => void openWeb("/home/reviews/request")} />
        </>
      ) : null}
    </Screen>
  );
}
