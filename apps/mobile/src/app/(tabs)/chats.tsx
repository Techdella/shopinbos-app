import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { List, Pill, Row, Sub, Tile, Title } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { ChipRow, EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Chip, Field, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { fetchInbox, type InboxListItem } from "@/lib/inbox";
import { channelLabel, channelsInUse, filterInbox, repliesByEmail, shortTime, type InboxView } from "@/lib/inbox-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Chats ("Seller app" prototype `on.chats`, restyled): the all-in-one inbox (web /home/messages): every customer conversation (WhatsApp, Instagram, email, live
// chat, contact form…) and the seller's supplier and delivery-partner chats, in one list.

// Labels are m_chats keys.
const VIEWS: Array<{ value: InboxView; label: "view.open" | "view.unread" | "view.snoozed" | "view.closed" }> = [
  { value: "open", label: "view.open" },
  { value: "unread", label: "view.unread" },
  { value: "snoozed", label: "view.snoozed" },
  { value: "closed", label: "view.closed" },
];

function open(item: InboxListItem) {
  if (item.source === "partner" && item.partner) {
    router.push({ pathname: "/partners/[id]", params: { id: item.partner.contactUserId, name: item.name } });
  } else {
    router.push({ pathname: "/inbox/[id]", params: { id: item.id } });
  }
}

export default function Chats() {
  const t = useT("m_chats", "m_ui", "nav");
  const inbox = useLoad(fetchInbox);
  const [view, setView] = useState<InboxView>("open");
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const items = inbox.data;
  const channels = useMemo(() => channelsInUse(items ?? []), [items]);
  const shown = useMemo(() => filterInbox(items ?? [], { view, channel, q }), [items, view, channel, q]);
  const unread = (items ?? []).filter((item) => item.unread > 0 && item.status !== "closed").length;

  return (
    <TabScreen
      refreshing={inbox.refreshing}
      onRefresh={() => void inbox.refresh()}
      header={
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 }}>
            <Title style={{ flex: 1 }}>{t("tab.chats")}</Title>
            {items ? <Pill label={unread ? t("list.newCount", { count: unread }) : t("list.allAnswered")} tone={unread ? "org" : "ok"} /> : null}
            <HelpButton />
          </View>
          <Sub>{t("list.allHere")}</Sub>
        </View>
      }
    >
      <Pressable accessibilityRole="button" onPress={() => router.push("/peggy")} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.mintTint, borderRadius: 24, padding: 16, opacity: pressed ? 0.9 : 1 })}>
        <Mascot name="peggy" size={38} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("peggy.ask")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("list.peggySub")}</T>
        </View>
        <AppIcon name="chevron" size={18} color={colors.inkSoft} />
      </Pressable>

      <Segmented options={VIEWS.map((option) => ({ ...option, label: option.value === "unread" && unread ? t("view.unreadCount", { count: unread }) : t(option.label) }))} value={view} onChange={setView} />

      <Field value={q} onChangeText={setQ} placeholder={t("list.search")} returnKeyType="search" accessibilityLabel={t("list.searchLabel")} style={{ height: 52, borderRadius: 16, borderWidth: 1.5 }} />

      {channels.length > 1 ? (
        <View>
          <ChipRow>
            <Chip label={t("partners.all")} on={channel === ""} onPress={() => setChannel("")} />
            {channels.map((key) => <Chip key={key} label={channelLabel(key, t)} on={channel === key} onPress={() => setChannel(channel === key ? "" : key)} />)}
          </ChipRow>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        {inbox.loading && !items ? <LoadingBlock label={t("list.loading")} /> : null}
        {inbox.error && !items ? <ErrorState message={inbox.error} onRetry={() => void inbox.reload()} /> : null}
        {items && !shown.length ? (
          <EmptyState
            icon="chat"
            title={items.length ? t("list.nothing") : t("list.noMessages")}
            action={items.length ? undefined : <PillButton title={t("list.connectButton")} size="md" onPress={() => router.push("/channels")} />}
          >
            {items.length ? t("list.nothingBody") : t("list.emptyBody")}
          </EmptyState>
        ) : null}
        {shown.length ? (
          <List>
        {shown.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.unread ? t("list.itemUnread", { name: item.name, channel: channelLabel(item.channel, t), count: item.unread }) : `${item.name}, ${channelLabel(item.channel, t)}`}${item.subject ? `, ${item.subject}` : ""}`}
            onPress={() => open(item)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.canvas : colors.surface })}
          >
            {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" /> : <Initials name={item.name} bg={item.source === "partner" ? colors.mintTint : colors.peach} fg={item.source === "partner" ? colors.forest : colors.accentInk} />}
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T weight={item.unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{item.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{shortTime(item.at, new Date(), t)}</T>
              </View>
              {item.subject ? <T weight={item.unread ? "bold" : "semibold"} style={{ fontSize: 15 }} numberOfLines={1}>{item.subject}</T> : null}
              <T style={{ color: item.unread ? colors.ink : colors.inkSoft, fontSize: 15 }} numberOfLines={1}>{item.preview || t("list.noMessages")}</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                {repliesByEmail(item.channel) ? <AppIcon name="mail" size={14} color={colors.inkSoft} /> : null}
                <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{item.source === "partner" ? item.sub ?? t("partners.partner") : channelLabel(item.channel, t)}</T>
                {item.status === "snoozed" ? <T weight="semibold" style={{ fontSize: 13, color: colors.accentInk }}>· {t("view.snoozed")}</T> : null}
              </View>
            </View>
            {item.unread ? (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                <T weight="extrabold" style={{ color: colors.ink, fontSize: 13.5 }}>{String(item.unread)}</T>
              </View>
            ) : null}
          </Pressable>
        ))}
          </List>
        ) : null}
      </View>

      <List>
        <Row lead={<Tile icon="users" tone="mint" />} title={t("partners.title")} sub={t("list.partnersHint")} onPress={() => router.push("/partners")} />
        <Row lead={<Tile icon="clock" tone="gray" />} title={t("list.autoReplies")} sub={t("list.autoRepliesHint")} onPress={() => router.push("/inbox/auto-replies")} />
        <Row lead={<Tile icon="mail" tone="gray" />} title={t("list.email")} sub={t("list.emailHint")} onPress={() => router.push("/channels")} />
        <Row lead={<Tile icon="chat" tone="gray" />} title={t("list.connect")} sub={t("list.connectHint")} onPress={() => router.push("/channels")} />
      </List>
    </TabScreen>
  );
}
