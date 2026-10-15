import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { ChipRow, EmptyState, ErrorState, Initials, LinkRow, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Card, Chip, Field, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { fetchInbox, type InboxListItem } from "@/lib/inbox";
import { channelLabel, channelsInUse, filterInbox, repliesByEmail, shortTime, type InboxView } from "@/lib/inbox-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// The all-in-one inbox (web /home/messages): every customer conversation (WhatsApp, Instagram, email, live
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
      title={t("tab.chats")}
      refreshing={inbox.refreshing}
      onRefresh={() => void inbox.refresh()}
    >
      <Pressable accessibilityRole="button" onPress={() => router.push("/peggy")} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.mintTint, borderRadius: radii.card, padding: 12, marginBottom: 14 }}>
        <Mascot name="peggy" size={38} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("peggy.ask")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("list.peggySub")}</T>
        </View>
        <AppIcon name="chevron" size={18} color={colors.inkSoft} />
      </Pressable>

      <Segmented options={VIEWS.map((option) => ({ ...option, label: option.value === "unread" && unread ? t("view.unreadCount", { count: unread }) : t(option.label) }))} value={view} onChange={setView} />

      <Field value={q} onChangeText={setQ} placeholder={t("list.search")} returnKeyType="search" accessibilityLabel={t("list.searchLabel")} style={{ marginTop: 12, height: 48 }} />

      {channels.length > 1 ? (
        <View style={{ marginTop: 12 }}>
          <ChipRow>
            <Chip label={t("partners.all")} on={channel === ""} onPress={() => setChannel("")} />
            {channels.map((key) => <Chip key={key} label={channelLabel(key, t)} on={channel === key} onPress={() => setChannel(channel === key ? "" : key)} />)}
          </ChipRow>
        </View>
      ) : null}

      <View style={{ marginTop: 14, gap: 8 }}>
        {inbox.loading && !items ? <LoadingBlock label={t("list.loading")} /> : null}
        {inbox.error && !items ? <ErrorState message={inbox.error} onRetry={() => void inbox.reload()} /> : null}
        {items && !shown.length ? (
          <EmptyState
            icon="chat"
            title={items.length ? t("list.nothing") : t("list.noMessages")}
            action={items.length ? undefined : <PillButton title={t("list.connectButton")} size="md" onPress={() => router.push({ pathname: "/ask-us", params: { what: "channels" } })} />}
          >
            {items.length ? t("list.nothingBody") : t("list.emptyBody")}
          </EmptyState>
        ) : null}
        {shown.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.unread ? t("list.itemUnread", { name: item.name, channel: channelLabel(item.channel, t), count: item.unread }) : `${item.name}, ${channelLabel(item.channel, t)}`}${item.subject ? `, ${item.subject}` : ""}`}
            onPress={() => open(item)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
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
                <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 13.5 }}>{String(item.unread)}</T>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Card style={{ marginTop: 18, paddingVertical: 2 }}>
        <LinkRow first icon="users" label={t("partners.title")} hint={t("list.partnersHint")} onPress={() => router.push("/partners")} />
        <LinkRow icon="clock" label={t("list.autoReplies")} hint={t("list.autoRepliesHint")} onPress={() => router.push("/inbox/auto-replies")} />
        <LinkRow icon="mail" label={t("list.email")} hint={t("list.emailHint")} onPress={() => router.push("/channels")} />
        <LinkRow icon="chat" label={t("list.connect")} hint={t("list.connectHint")} onPress={() => router.push({ pathname: "/ask-us", params: { what: "channels" } })} />
      </Card>
    </TabScreen>
  );
}
