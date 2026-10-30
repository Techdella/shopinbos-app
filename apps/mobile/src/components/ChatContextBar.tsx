import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { API_URL, authHeader } from "@/lib/api";
import { formatMoney } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The seller's one chat inbox on the phone (founder's plan item 8): the bar at the top of a thread with the order or
// delivery the chat belongs to (customer, partner and rider chats), and a playable bubble for customers' voice notes.

const pretty = (status: string) => status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export interface ChatOrderContext {
  id: string;
  number: string;
  status?: string | null;
  total?: number | null;
  currency?: string | null;
}

/** "Order #1042 · ₦12,500 / Paid · In transit", tapping opens the order. Nothing when there's no order or delivery. */
export function ChatContextBar({
  order,
  deliveryStatus,
  label,
  sub: subLine,
  delivery = Boolean(deliveryStatus),
}: {
  order: ChatOrderContext | null;
  deliveryStatus?: string | null;
  /** The title when it isn't an order (a wholesale order or delivery linked in a partner chat). */
  label?: string | null;
  /** The second line as it is (a partner chat's linked item), instead of the statuses. */
  sub?: string | null;
  /** A delivery rather than an order (the eyebrow and icon). */
  delivery?: boolean;
}) {
  const t = useT("m_chats");
  const locale = useLocale();
  if (!order && !deliveryStatus && !label) return null;
  const title = order
    ? order.total != null
      ? t("ctx.orderLine", { number: order.number, total: formatMoney(order.total, locale, { currency: order.currency || "NGN" }) })
      : t("ctx.orderShort", { number: order.number })
    : label ?? t("ctx.noOrder");
  const sub = subLine ?? [
    order?.status ? t.dynamic(`ctx.order.${order.status}`, pretty(order.status)) : null,
    deliveryStatus ? t.dynamic(`ctx.job.${deliveryStatus}`, pretty(deliveryStatus)) : null,
  ].filter(Boolean).join(" · ");
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 16, marginBottom: 6 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={delivery ? "truck" : "bag"} size={17} color={colors.inkSoft} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="bold" style={{ fontSize: 11, color: colors.inkFaint, letterSpacing: 0.6 }}>{(delivery ? t("ctx.delivery") : t("ctx.order")).toUpperCase()}</T>
        <T weight="extrabold" numberOfLines={1} style={{ fontSize: 14.5 }}>{title}</T>
        {sub ? <T numberOfLines={1} style={{ fontSize: 12.5, color: colors.inkSoft }}>{sub}</T> : null}
      </View>
      {order ? <AppIcon name="chevron" size={16} color={colors.inkFaint} /> : null}
    </View>
  );
  if (!order) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}. ${t("ctx.open")}`} onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}>
      {body}
    </Pressable>
  );
}

/**
 * A customer's voice note (WhatsApp/Telegram audio, a voicemail): play and pause in the bubble. The file streams through
 * the same signed-in route as the web (GET /api/app/inbox/media/<message>/<index>), so the store's tokens never reach
 * the phone.
 */
export function VoiceNoteBubble({ messageId, index, mine }: { messageId: string; index: number; mine: boolean }) {
  const t = useT("m_chats");
  // One player per bubble, freed with the bubble; the file loads on the first tap (with the sign-in header).
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const playing = Boolean(status.playing);

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0).catch(() => null);
  }, [status.didJustFinish, player]);

  async function toggle() {
    try {
      setFailed(false);
      if (!loaded) {
        player.replace({ uri: `${API_URL}/api/app/inbox/media/${encodeURIComponent(messageId)}/${index}`, headers: await authHeader() });
        setLoaded(true);
      }
      if (playing) player.pause();
      else player.play();
    } catch {
      setFailed(true);
    }
  }

  const fg = mine ? "#FFFFFF" : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? t("voice.pause") : t("voice.play")} onPress={() => void toggle()} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: mine ? "rgba(255,255,255,0.18)" : colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={playing ? "volumeOff" : "play"} size={16} color={fg} />
      </View>
      <T weight="semibold" style={{ fontSize: 14, color: fg }}>{failed ? t("voice.failed") : playing ? t("voice.playing") : t("voice.note")}</T>
    </Pressable>
  );
}
