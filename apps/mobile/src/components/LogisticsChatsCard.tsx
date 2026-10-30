import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { recentChats, totalUnread } from "@shared/logistics-chats";
import { Initials } from "@/components/kit";
import { Card, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { useT } from "@/lib/i18n";
import { fetchRiderChats } from "@/lib/logistics";
import { fetchChatContacts, ROLE_LABEL } from "@/lib/partner-chat";
import { useLoad } from "@/lib/useLoad";
import { colors, themed } from "@/theme";

// "Messages" on the delivery partner's Jobs tab (where the app lands): the latest chats with their riders, shops and
// suppliers, unread first (shared/logistics-chats.ts recentChats), each opening that chat, and "See all" (Chats tab).
// Hidden while there are no chats.

const TONE = themed(() => ({
  rider: { bg: colors.warnTint, fg: colors.warnInk },
  seller: { bg: colors.peach, fg: colors.accentInk },
  supplier: { bg: colors.blueTint, fg: colors.blueInk },
  logistics_partner: { bg: colors.mintTint, fg: colors.forest },
}));

type Row = { key: string; id: string; kind: string; name: string; text: string; at: string; unread: number };

export function LogisticsChatsCard({ limit = 4 }: { limit?: number }) {
  const t = useT("m_partner");
  const ui = useT("m_chats", "m_ui");
  const contacts = useLoad(() => fetchChatContacts().catch(() => []));
  const riders = useLoad(() => fetchRiderChats().catch(() => []));

  const all = useMemo<Row[]>(
    () => [
      ...(riders.data ?? []).map((rider) => ({
        key: `r:${rider.riderId}`,
        id: rider.riderId,
        kind: "rider",
        name: rider.name,
        text: rider.last ? `${rider.last.mine ? `${t("chat.you")} ` : ""}${rider.last.text}` : "",
        at: rider.last?.createdAt ?? "",
        unread: rider.unread,
      })),
      ...(contacts.data ?? []).map((contact) => ({ key: `c:${contact.id}`, id: contact.id, kind: contact.role, name: contact.name, text: contact.lastMessage ?? "", at: contact.lastMessageAt ?? "", unread: contact.unread })),
    ],
    [riders.data, contacts.data, t],
  );
  const rows = recentChats(all, limit);
  const unread = totalUnread(all);
  if (!rows.length) return null;

  function open(row: Row) {
    if (row.kind === "rider") router.push({ pathname: "/logistics/team/chat/[id]", params: { id: row.id, name: row.name } });
    else router.push({ pathname: "/logistics/chat/[id]", params: { id: row.id, name: row.name, role: row.kind } });
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("home.chats")}</T>
        {unread > 0 ? (
          <View accessibilityLabel={t("home.chatsUnread", { count: unread })} style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 12, color: colors.onAccent }}>{unread > 99 ? "99+" : String(unread)}</T>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.navigate("/logistics/messages")}>
          <T weight="bold" style={{ color: colors.forest, fontSize: 14.5 }}>{t("home.chatsAll")}</T>
        </Pressable>
      </View>
      {rows.map((row) => {
        const tone = TONE[row.kind as keyof typeof TONE] ?? TONE.logistics_partner;
        const label = t.dynamic(`chat.role.${row.kind}`, ROLE_LABEL[row.kind] ?? t("chat.role.other"));
        const time = row.at ? shortTime(row.at, new Date(), ui) : "";
        return (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={[row.name, label, row.unread > 0 ? t("home.chatsUnread", { count: row.unread }) : null, row.text, time].filter(Boolean).join(", ")}
            onPress={() => open(row)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, opacity: pressed ? 0.85 : 1 })}
          >
            <Initials name={row.name} size={42} bg={tone.bg} fg={tone.fg} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <T weight={row.unread > 0 ? "extrabold" : "bold"} numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>{row.name}</T>
                <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: tone.bg }}>
                  <T weight="bold" style={{ fontSize: 11, color: tone.fg }}>{label}</T>
                </View>
                <View style={{ flex: 1 }} />
                <T style={{ fontSize: 12.5, color: colors.inkSoft }}>{time}</T>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T numberOfLines={1} weight={row.unread > 0 ? "semibold" : "regular"} style={{ flex: 1, fontSize: 13.5, color: row.unread > 0 ? colors.ink : colors.inkSoft }}>{row.text}</T>
                {row.unread > 0 ? (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                    <T weight="extrabold" style={{ fontSize: 11, color: colors.onAccent }}>{row.unread > 99 ? "99+" : String(row.unread)}</T>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}
