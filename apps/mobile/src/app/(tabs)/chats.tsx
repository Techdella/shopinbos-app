import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { ChipRow, EmptyState, ErrorState, Initials, LinkRow, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Card, Chip, Field, Mascot, PillButton, Segmented, T } from "@/components/ui";
import { fetchInbox, type InboxListItem } from "@/lib/inbox";
import { channelLabel, channelsInUse, filterInbox, shortTime, type InboxView } from "@/lib/inbox-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// The all-in-one inbox (web /home/messages): every customer conversation (WhatsApp, Instagram, email, live
// chat, contact form…) and the seller's supplier and delivery-partner chats, in one list.

const VIEWS: Array<{ value: InboxView; label: string }> = [
  { value: "open", label: "Open" },
  { value: "unread", label: "Unread" },
  { value: "snoozed", label: "Later" },
  { value: "closed", label: "Done" },
];

function open(item: InboxListItem) {
  if (item.source === "partner" && item.partner) {
    router.push({ pathname: "/partners/[id]", params: { id: item.partner.contactUserId, name: item.name } });
  } else {
    router.push({ pathname: "/inbox/[id]", params: { id: item.id } });
  }
}

export default function Chats() {
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
      title="Chats"
      refreshing={inbox.refreshing}
      onRefresh={() => void inbox.refresh()}
    >
      <Pressable accessibilityRole="button" onPress={() => router.push("/peggy")} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.mintTint, borderRadius: radii.card, padding: 12, marginBottom: 14 }}>
        <Mascot name="peggy" size={38} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>Ask Peggy</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>She can write answers to your customers for you.</T>
        </View>
        <AppIcon name="chevron" size={18} color={colors.inkSoft} />
      </Pressable>

      <Segmented options={VIEWS.map((option) => ({ ...option, label: option.value === "unread" && unread ? `Unread ${unread}` : option.label }))} value={view} onChange={setView} />

      <Field value={q} onChangeText={setQ} placeholder="Find a name or message" returnKeyType="search" accessibilityLabel="Search conversations" style={{ marginTop: 12, height: 48 }} />

      {channels.length > 1 ? (
        <View style={{ marginTop: 12 }}>
          <ChipRow>
            <Chip label="All" on={channel === ""} onPress={() => setChannel("")} />
            {channels.map((key) => <Chip key={key} label={channelLabel(key)} on={channel === key} onPress={() => setChannel(channel === key ? "" : key)} />)}
          </ChipRow>
        </View>
      ) : null}

      <View style={{ marginTop: 14, gap: 8 }}>
        {inbox.loading && !items ? <LoadingBlock label="Loading your chats…" /> : null}
        {inbox.error && !items ? <ErrorState message={inbox.error} onRetry={() => void inbox.reload()} /> : null}
        {items && !shown.length ? (
          <EmptyState
            icon="chat"
            title={items.length ? "Nothing here" : "No messages yet"}
            action={items.length ? undefined : <PillButton title="Connect WhatsApp and Instagram" size="md" onPress={() => router.push({ pathname: "/ask-us", params: { what: "channels" } })} />}
          >
            {items.length ? "Tap Open to see the rest, or pull down to check for new messages." : "Connect WhatsApp, Instagram and more, and every customer message comes here. We set it up for you."}
          </EmptyState>
        ) : null}
        {shown.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${channelLabel(item.channel)}${item.unread ? `, ${item.unread} unread` : ""}`}
            onPress={() => open(item)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
          >
            {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" /> : <Initials name={item.name} bg={item.source === "partner" ? colors.mintTint : colors.peach} fg={item.source === "partner" ? colors.forest : colors.accentInk} />}
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T weight={item.unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{item.name}</T>
                <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{shortTime(item.at)}</T>
              </View>
              <T style={{ color: item.unread ? colors.ink : colors.inkSoft, fontSize: 15 }} numberOfLines={1}>{item.preview || "No messages yet"}</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{item.source === "partner" ? item.sub ?? "Partner" : channelLabel(item.channel)}</T>
                {item.status === "snoozed" ? <T weight="semibold" style={{ fontSize: 13, color: colors.accentInk }}>· Later</T> : null}
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
        <LinkRow first icon="users" label="Messages with suppliers and riders" onPress={() => router.push("/partners")} />
        <LinkRow icon="clock" label="Replies when you're busy" hint="Away message and opening hours" onPress={() => router.push("/inbox/auto-replies")} />
        <LinkRow icon="chat" label="Connect WhatsApp, Instagram, TikTok" hint="We set it up for you" onPress={() => router.push({ pathname: "/ask-us", params: { what: "channels" } })} />
      </Card>
    </TabScreen>
  );
}
