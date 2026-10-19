import { useState } from "react";
import { Alert, Linking, Pressable, Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { AppIcon } from "@/components/icons";
import { ChipRow, EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { askForReviews, fetchAskData, REQUEST_CHANNELS, type AskableOrder, type AskOutcome, type RequestChannel } from "@/lib/reviews";
import { channelReady, chooseAll, defaultChannel, keepReachable, visibleOrders } from "@/lib/review-ask";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Ask for reviews (web /home/reviews/request): choose recent paid or delivered orders and how to ask (email, SMS or
// WhatsApp from the shop, or a WhatsApp message the seller sends from their own phone), confirm, and see what went.
// Buyers get a signed link to rate every item in their order, with photos, no sign-in. Plus the reviews wall link.

type Note = { tone: "success" | "error"; text: string };

function OrderRow({ order, channel, on, onToggle, now }: { order: AskableOrder; channel: RequestChannel; on: boolean; onToggle: () => void; now: Date }) {
  const t = useT("m_reviews", "m_ui", "common");
  const reachable = order.reach[channel];
  const status = t.dynamic(`status.${order.status}`, order.status.charAt(0).toUpperCase() + order.status.slice(1));
  const side = order.reviewed
    ? { text: t("askScreen.reviewed"), color: colors.success }
    : order.asked
      ? { text: t("askScreen.asked", { when: shortTime(order.asked.at, now, t) }), color: colors.inkSoft }
      : !reachable
        ? { text: channel === "email" ? t("askScreen.noEmail") : t("askScreen.noPhone"), color: colors.inkSoft }
        : null;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !reachable }}
      disabled={!reachable}
      onPress={onToggle}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8, opacity: !reachable ? 0.5 : pressed ? 0.85 : 1 })}
    >
      <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.ink : colors.surface, alignItems: "center", justifyContent: "center" }}>
        {on ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{order.customerName}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>#{order.orderNumber} · {status} · {shortTime(order.at, now, t)}</T>
      </View>
      {side ? <T weight="bold" style={{ color: side.color, fontSize: 13, maxWidth: 110, textAlign: "right" }}>{side.text}</T> : null}
    </Pressable>
  );
}

export default function AskForReviews() {
  const t = useT("m_reviews", "m_ui", "common");
  const data = useLoad(fetchAskData);
  const [picked, setPicked] = useState<RequestChannel | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [problems, setProblems] = useState<AskOutcome[]>([]);
  const [links, setLinks] = useState<AskOutcome[]>([]);
  // When this screen opened, for "Asked Mon" (render stays pure).
  const [now] = useState(() => new Date());

  const ask = data.data;
  const channel = picked ?? (ask ? defaultChannel(ask.ready) : "link");
  const ready = ask ? channelReady(ask.ready, channel) : true;
  const shown = ask ? visibleOrders(ask.orders, showAll) : [];
  const label = (value: RequestChannel) => t(`channel.${value}`);

  function pickChannel(value: RequestChannel) {
    setPicked(value);
    if (ask) setChosen((current) => keepReachable(current, ask.orders, value));
  }

  function toggle(id: string) {
    setChosen((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function send() {
    if (!ask) return;
    setBusy(true);
    setNote(null);
    setProblems([]);
    setLinks([]);
    try {
      const result = await askForReviews(chosen, channel, showAll);
      const parts = [
        result.sent ? (channel === "link" ? t("askScreen.linksReady", { count: result.sent }) : t("askScreen.sent", { count: result.sent })) : "",
        result.failed ? t("askScreen.failed", { count: result.failed }) : "",
        result.skipped ? t("askScreen.skipped", { count: result.skipped }) : "",
      ].filter(Boolean);
      setNote({ tone: result.sent > 0 ? "success" : "error", text: parts.join(" · ") || t("askScreen.nothing") });
      setProblems(result.results.filter((item) => item.status === "failed" || item.status === "skipped"));
      setLinks(result.results.filter((item) => item.status === "link" && item.whatsappUrl));
      setChosen([]);
      await data.reload();
    } catch (sendError) {
      setNote({ tone: "error", text: sendError instanceof Error ? sendError.message : t("askScreen.sendFailed") });
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!ask || !chosen.length) return;
    const again = ask.orders.some((order) => chosen.includes(order.id) && (order.asked || order.reviewed));
    const body = [channel === "link" ? t("askScreen.confirmLink") : t("askScreen.confirmSend", { channel: label(channel) }), again ? t("askScreen.confirmAgain") : ""].filter(Boolean).join("\n\n");
    Alert.alert(t("askScreen.confirmTitle", { count: chosen.length }), body, [
      { text: t("cancel"), style: "cancel" },
      { text: t("askScreen.yes"), onPress: () => void send() },
    ]);
  }

  async function copyWall(wall: string) {
    await Clipboard.setStringAsync(wall);
    setNote({ tone: "success", text: t("askScreen.wallCopied") });
  }

  return (
    <Screen
      title={t("ask")}
      sub={t("askScreen.sub")}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={ask && ask.orders.length ? (
        <PillButton
          title={channel === "link" ? t("askScreen.makeLinks", { count: chosen.length }) : t("askScreen.send", { count: chosen.length })}
          busy={busy}
          disabled={!chosen.length || !ready || !ask.ready.links}
          onPress={confirm}
        />
      ) : undefined}
    >
      {data.loading && !ask ? <LoadingBlock /> : null}
      {data.error && !ask ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {problems.length ? (
        <Card style={{ gap: 4 }}>
          {problems.slice(0, 20).map((item) => <T key={item.orderId} style={{ color: colors.inkSoft, fontSize: 14 }}>#{item.orderNumber} {item.customerName}: {item.reason}</T>)}
        </Card>
      ) : null}
      {links.length ? (
        <Card style={{ gap: 10, backgroundColor: colors.mintTint }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("askScreen.linksTitle")}</T>
          {links.map((item) => (
            <View key={item.orderId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{item.customerName} · #{item.orderNumber}</T>
              <PillButton title={t("askScreen.openWhatsApp")} size="sm" tone="forest" onPress={() => void Linking.openURL(item.whatsappUrl!)} />
            </View>
          ))}
        </Card>
      ) : null}

      {ask ? (
        <>
          {!ask.ready.links ? <Notice>{t("askScreen.noLinks")}</Notice> : null}

          <SectionTitle>{t("askScreen.now")}</SectionTitle>
          <Card style={{ gap: 10 }}>
            <T weight="bold" style={{ fontSize: 15 }}>{t("askScreen.how")}</T>
            <ChipRow>
              {REQUEST_CHANNELS.map((value) => <Chip key={value} label={label(value)} on={channel === value} onPress={() => pickChannel(value)} />)}
            </ChipRow>
            <T style={{ color: ready ? colors.inkSoft : colors.danger, fontSize: 14, lineHeight: 20 }}>
              {channel === "link" ? t("askScreen.linkHint") : ready ? t("askScreen.readyHint") : t("askScreen.notSetUp", { channel: label(channel) })}
            </T>
          </Card>

          {!ask.orders.length ? <EmptyState icon="bag" title={t("askScreen.emptyTitle")}>{t("askScreen.emptyBody")}</EmptyState> : (
            <Card style={{ paddingVertical: 8, gap: 2 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }}>{t("askScreen.chosen", { count: chosen.length })}</T>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <LinkButton title={t("askScreen.chooseAll")} onPress={() => setChosen(chooseAll(shown, channel))} />
                  {chosen.length ? <LinkButton title={t("askScreen.clear")} color={colors.inkSoft} onPress={() => setChosen([])} /> : null}
                </View>
              </View>
              {shown.length ? shown.map((order) => <OrderRow key={order.id} order={order} channel={channel} on={chosen.includes(order.id)} onToggle={() => toggle(order.id)} now={now} />) : (
                <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, paddingVertical: 10 }}>{t("askScreen.everyoneAsked")}</T>
              )}
              <LinkButton title={showAll ? t("askScreen.hideAsked") : t("askScreen.showAsked")} color={colors.accentInk} onPress={() => setShowAll((value) => !value)} />
            </Card>
          )}

          <SectionTitle>{t("askScreen.wall")}</SectionTitle>
          <Card style={{ gap: 10, borderRadius: radii.card }}>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t("askScreen.wallBody")}</T>
            <T weight="semibold" style={{ fontSize: 14 }} selectable numberOfLines={1}>{ask.wall}</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PillButton title={t("share")} size="sm" style={{ flex: 1 }} onPress={() => void Share.share({ message: t("askScreen.wallMessage", { url: ask.wall }) })} />
              <PillButton title={t("askScreen.copyLink")} size="sm" tone="white" style={{ flex: 1 }} onPress={() => void copyWall(ask.wall)} />
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
