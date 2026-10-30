import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { offPlatformSignals } from "@shared/delivery-market";
import { ChatListScreen, type ChatRowData } from "@/components/ChatList";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { Small } from "@/components/design";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Notice, PillButton, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { roleChatFilters, roleChatMatches, type RoleChatFilter } from "@/lib/chats-pure";
import { fetchChatContacts, ROLE_LABEL } from "@/lib/partner-chat";
import { fetchPartnerMessages, sendPartnerMessage } from "@/lib/partners";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { colors, themed } from "@/theme";

// Chats for the supplier and delivery partner apps ("Familiar app" prototype `chats` and `thread`): only the
// conversations with the shops, suppliers and delivery partners they work with (/api/conversations), newest first,
// with filter chips by the other side's role (a supplier: Shops / Delivery partners; a delivery partner: Shops /
// Suppliers) and Unread, and a search. In a thread everyone sees "Keep it on Shopinbos" when a message (or what
// they're typing) looks like moving the job off the app (shared offPlatformSignals). Delivery partners also get quick
// replies before their first message and "Send them a private rate" when they're talking to a seller or supplier.

type Base = "/supplier" | "/logistics";

const AVATAR: Record<string, { bg: string; fg: string }> = themed(() => ({
  seller: { bg: colors.peach, fg: colors.accentInk },
  supplier: { bg: colors.blueTint, fg: colors.blueInk },
  logistics_partner: { bg: colors.mintTint, fg: colors.forest },
}));

const FILTER_WORD: Record<RoleChatFilter, "chats.filter.all" | "chats.filter.seller" | "chats.filter.supplier" | "chats.filter.logistics_partner" | "chats.filter.unread"> = {
  all: "chats.filter.all",
  seller: "chats.filter.seller",
  supplier: "chats.filter.supplier",
  logistics_partner: "chats.filter.logistics_partner",
  unread: "chats.filter.unread",
};

export function MessagesTab({ base }: { base: Base }) {
  const t = useT("m_partner");
  const contacts = useLoad(fetchChatContacts);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RoleChatFilter>("all");
  const all = contacts.data;
  const unread = (all ?? []).filter((contact) => contact.unread > 0).length;
  const rows = useMemo<ChatRowData[] | null>(
    () =>
      all
        ? all
            .filter((contact) => roleChatMatches(contact, filter, q))
            .map((contact) => ({
              key: contact.id,
              name: contact.name,
              preview: contact.lastMessage ?? "",
              at: contact.lastMessageAt,
              unread: contact.unread,
              tone: AVATAR[contact.role] ?? AVATAR.logistics_partner,
              label: t.dynamic(`chat.role.${contact.role}`, ROLE_LABEL[contact.role] ?? t("chat.role.other")),
              onPress: () => router.push({ pathname: `${base}/chat/[id]` as never, params: { id: contact.id, name: contact.name, role: contact.role } }),
            }))
        : null,
    [all, filter, q, t, base],
  );

  return (
    <ChatListScreen
      title={t("chats.title")}
      filters={roleChatFilters(base === "/supplier" ? "supplier" : "logistics_partner").map((key) => ({ key, label: t(FILTER_WORD[key]), count: key === "unread" ? unread : undefined }))}
      filter={filter}
      onFilter={setFilter}
      chats={rows}
      q={q}
      onSearch={setQ}
      loading={contacts.loading}
      error={contacts.error}
      onRetry={() => void contacts.reload()}
      refreshing={contacts.refreshing}
      onRefresh={() => void contacts.refresh()}
      empty={all && !all.length ? <EmptyState icon="chat" title={t("chat.none")}>{t("chat.noneBody")}</EmptyState> : undefined}
    />
  );
}

/** Quick replies a delivery partner can send before their first message in a thread (m_partner "quick.<n>"). */
const QUICK = ["quick.0", "quick.1", "quick.2"] as const;

/** One conversation (?name= is shown while the messages load, ?role= is the other side's role). `quickReplies`
 * (already translated, for the other side's role) are offered before your first message; delivery partners keep
 * their own set. */
export function ConversationScreen({ base, quickReplies }: { base: Base; quickReplies?: (role: string) => string[] }) {
  const { id, name, role } = useLocalSearchParams<{ id: string; name?: string; role?: string }>();
  const t = useT("m_partner");
  const tu = useT("m_ui");
  const messages = useLoad(() => fetchPartnerMessages(String(id)), String(id));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = name || t("chat.conversation");
  const partner = base === "/logistics";
  // A job's "Message the shop" opens this without a role: that's the seller.
  const otherRole = role || (partner ? "seller" : "");
  const canRate = partner && (otherRole === "seller" || otherRole === "supplier");
  const list = messages.data ?? [];
  const sentAny = list.some((message) => message.mine);
  const warn = offPlatformSignals(draft).length > 0 || list.some((message) => offPlatformSignals(message.text).length > 0);

  async function send(text = draft.trim()) {
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendPartnerMessage(String(id), text);
      if (text === draft.trim()) setDraft("");
      messages.setData([...(messages.data ?? []), sent]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("chat.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  const replies = partner ? QUICK.map((key) => t(key)) : (quickReplies?.(otherRole) ?? []);
  const quick = replies.length && messages.data && !sentAny ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {replies.map((reply) => (
        <Pressable
          key={reply}
          accessibilityRole="button"
          disabled={sending}
          onPress={() => void send(reply)}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center", opacity: pressed || sending ? 0.7 : 1 })}
        >
          <T weight="bold" style={{ fontSize: 15 }}>{reply}</T>
        </Pressable>
      ))}
    </ScrollView>
  ) : null;

  return (
    <ChatScreen
      header={
        <>
          <Initials name={title} size={40} bg={(AVATAR[otherRole] ?? AVATAR.logistics_partner).bg} fg={(AVATAR[otherRole] ?? AVATAR.logistics_partner).fg} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{title}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{otherRole ? t.dynamic(`chat.role.${otherRole}`, ROLE_LABEL[otherRole] ?? t("chat.role.other")) : t("chat.onShopinbos")}</T>
          </View>
        </>
      }
      refreshing={messages.refreshing}
      onRefresh={() => void messages.refresh()}
      scrollKey={`${list.length}-${warn ? 1 : 0}`}
      composer={
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(text) => void send(text?.trim() ?? draft.trim())}
          busy={sending}
          placeholder={t("chat.messageTo", { name: title })}
          above={
            <>
              {quick}
              {error ? <Notice>{error}</Notice> : null}
            </>
          }
        />
      }
    >
      {messages.loading && !messages.data ? <LoadingBlock /> : null}
      {messages.error && !messages.data ? <ErrorState message={messages.error} onRetry={() => void messages.reload()} /> : null}
      {messages.data && !messages.data.length ? <Small style={{ textAlign: "center" }}>{t("chat.empty")}</Small> : null}
      {list.map((message) => (
        <Bubble key={message.id} mine={message.mine} meta={shortTime(message.createdAt)}>{message.text}</Bubble>
      ))}
      {warn ? (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.warnTint, borderRadius: 24, padding: 20, gap: 8, marginTop: 4 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{tu("chat.keepTitle")}</T>
          <T style={{ fontSize: 16, lineHeight: 24, color: colors.warnInk }}>{tu("chat.keepBody")}</T>
        </View>
      ) : null}
      {canRate ? (
        <PillButton tone="white" onPress={() => router.push({ pathname: "/logistics/private-rate", params: { ownerUserId: String(id), name: title } })} icon="tag" title={t("chat.privateRate")} />
      ) : null}
    </ChatScreen>
  );
}
