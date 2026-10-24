import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { Seg, Sub, Title } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Field, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The Chats tab for every role ("Familiar app" prototype `chats`): the title with a search button (and, for sellers,
// a settings button), one row of filter chips, and the conversations in one white card: picture or initials, name,
// last message, time and an unread count. Nothing else on the screen.

export interface ChatRowData {
  key: string;
  name: string;
  preview: string;
  at: string | null;
  unread: number;
  avatarUrl?: string | null;
  tone: { bg: string; fg: string };
  /** Read out after the name ("Supplier", "WhatsApp"). */
  label?: string;
  onPress: () => void;
}

export function HeaderIcon({ icon, label, onPress, expanded }: { icon: AppIconName; label: string; onPress: () => void; expanded?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded == null ? undefined : { expanded }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
    >
      <AppIcon name={icon} size={21} />
    </Pressable>
  );
}

function ChatRow({ chat }: { chat: ChatRowData }) {
  const t = useT("m_chats", "m_ui");
  const time = chat.at ? shortTime(chat.at, new Date(), t) : "";
  const unread = chat.unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[chat.name, chat.label, unread ? t("chats.unreadCount", { count: chat.unread }) : null, chat.preview, time].filter(Boolean).join(", ")}
      onPress={chat.onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.canvas : colors.surface })}
    >
      {chat.avatarUrl ? (
        <Image source={{ uri: chat.avatarUrl }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: chat.tone.bg }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Initials name={chat.name} size={46} bg={chat.tone.bg} fg={chat.tone.fg} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T weight={unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{chat.name}</T>
          {time ? <T weight={unread ? "bold" : "regular"} style={{ fontSize: 13, color: unread ? colors.accentInk : colors.inkSoft }}>{time}</T> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T style={{ flex: 1, fontSize: 14.5, color: unread ? colors.ink : colors.inkSoft }} numberOfLines={1}>{chat.preview || t("chats.sayHello")}</T>
          {unread ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <T weight="extrabold" style={{ color: colors.ink, fontSize: 12.5 }}>{chat.unread > 9 ? "9+" : String(chat.unread)}</T>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function ChatListScreen<F extends string>({
  title,
  filters,
  filter,
  onFilter,
  chats,
  q,
  onSearch,
  loading,
  error,
  onRetry,
  refreshing,
  onRefresh,
  actions,
  empty,
}: {
  title: string;
  filters: Array<{ key: F; label: string; count?: number }>;
  filter: F;
  onFilter: (key: F) => void;
  /** Already filtered and searched. */
  chats: ChatRowData[] | null;
  q: string;
  onSearch: (q: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** More header buttons (a seller's chat settings). */
  actions?: ReactNode;
  /** Shown when there are no chats at all. */
  empty?: ReactNode;
}) {
  const t = useT("m_chats");
  const [searching, setSearching] = useState(false);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 }}>
      <Title style={{ flex: 1 }}>{title}</Title>
      <HeaderIcon
        icon={searching ? "x" : "search"}
        label={searching ? t("chats.searchClose") : t("list.searchLabel")}
        expanded={searching}
        onPress={() => {
          if (searching) onSearch("");
          setSearching(!searching);
        }}
      />
      {actions}
    </View>
  );

  return (
    <TabScreen header={header} refreshing={refreshing} onRefresh={onRefresh}>
      {searching ? <Field value={q} onChangeText={onSearch} placeholder={t("list.search")} returnKeyType="search" autoFocus accessibilityLabel={t("list.searchLabel")} style={{ height: 48, marginTop: -8 }} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, flexGrow: 0, marginTop: -6 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {filters.map((option) => (
          <Seg key={option.key} label={option.label} count={option.count || undefined} on={filter === option.key} onPress={() => onFilter(option.key)} />
        ))}
      </ScrollView>

      {loading && !chats ? <LoadingBlock label={t("list.loading")} /> : null}
      {error && !chats ? <ErrorState message={error} onRetry={onRetry} /> : null}

      {chats && !chats.length ? (
        empty ?? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
            <Sub>{q.trim() ? t("chats.noMatch") : t("chats.noneHere")}</Sub>
          </View>
        )
      ) : null}

      {chats?.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
          {chats.map((chat, index) => (
            <View key={chat.key} style={index ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
              <ChatRow chat={chat} />
            </View>
          ))}
        </View>
      ) : null}
    </TabScreen>
  );
}
