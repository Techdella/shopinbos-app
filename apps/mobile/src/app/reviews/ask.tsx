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
import { colors } from "@/theme";

// Ask for reviews from your own phone: each recent order gets a signed link where the buyer rates every item
// (no sign-in), shared on WhatsApp or anywhere. Email and SMS requests in the store's name are on the web.

export default function AskForReviews() {
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
      setNote({ tone: "error", text: askError instanceof Error ? askError.message : "Couldn't make the link. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function copyWall(wall: string) {
    await Clipboard.setStringAsync(wall);
    setNote({ tone: "success", text: "Reviews wall link copied." });
  }

  return (
    <Screen title="Ask for reviews" sub="Buyers get a link to rate every item in their order, with photos. No sign-in needed." refreshing={data.refreshing} onRefresh={() => void data.refresh()}>
      {data.loading && !data.data ? <LoadingBlock /> : null}
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={() => void data.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/reviews/request") }} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {data.data ? (
        <>
          <Card style={{ gap: 10 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>Your reviews wall</T>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>Every published review on one page. Share it so new shoppers can see what people say.</T>
            <T weight="semibold" style={{ fontSize: 14 }} selectable numberOfLines={1}>{data.data.wall}</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PillButton title="Share" size="sm" style={{ flex: 1 }} onPress={() => void Share.share({ message: `See what customers say about us: ${data.data!.wall}` })} />
              <PillButton title="Copy link" size="sm" tone="white" style={{ flex: 1 }} onPress={() => void copyWall(data.data!.wall)} />
            </View>
          </Card>

          <SectionTitle>Recent orders</SectionTitle>
          {!data.data.orders.length ? <EmptyState icon="bag" title="No paid orders yet">Paid and delivered orders from the last four months show up here.</EmptyState> : null}
          {data.data.orders.map((order) => (
            <Card key={order.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{order.customerName}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>#{order.orderNumber} · {order.status.charAt(0).toUpperCase() + order.status.slice(1)} · {shortTime(order.at)}</T>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {order.hasPhone ? <PillButton title="WhatsApp" size="sm" tone="forest" style={{ flex: 1 }} busy={busy === `whatsapp:${order.id}`} disabled={busy !== null} onPress={() => void ask(order.id, "whatsapp")} /> : null}
                <PillButton title="Share link" size="sm" tone="white" style={{ flex: 1 }} busy={busy === `share:${order.id}`} disabled={busy !== null} onPress={() => void ask(order.id, "share")} />
              </View>
            </Card>
          ))}
          <PillButton title="Send by email or SMS on the web" tone="white" size="md" onPress={() => void openWeb("/home/reviews/request")} />
        </>
      ) : null}
    </Screen>
  );
}
