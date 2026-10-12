import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { EmptyState, ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { TabScreen } from "@/components/TabScreen";
import { Field, Notice, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { fetchChatContacts, ROLE_LABEL } from "@/lib/partner-chat";
import { fetchPartnerMessages, sendPartnerMessage } from "@/lib/partners";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Messages tab and conversation screen for the supplier and delivery partner apps: chats with the shops they
// work with (and each other), the same threads as the web portal's inbox.

type Base = "/supplier" | "/logistics";

export function MessagesTab({ base, webPath }: { base: Base; webPath: string }) {
  const contacts = useLoad(fetchChatContacts);
  const [q, setQ] = useState("");
  const list = (contacts.data ?? []).filter((contact) => !q.trim() || `${contact.name} ${contact.lastMessage ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <TabScreen title="Messages" refreshing={contacts.refreshing} onRefresh={() => void contacts.refresh()}>
      <Field value={q} onChangeText={setQ} placeholder="Search name or message" returnKeyType="search" accessibilityLabel="Search conversations" style={{ height: 48, marginBottom: 14 }} />
      <View style={{ gap: 8 }}>
        {contacts.loading && !contacts.data ? <LoadingBlock label="Loading your messages…" /> : null}
        {contacts.error && !contacts.data ? <ErrorState message={contacts.error} onRetry={() => void contacts.reload()} web={{ label: "Open on web", onPress: () => void openWeb(webPath) }} /> : null}
        {contacts.data && !list.length ? (
          <EmptyState icon="chat" title={contacts.data.length ? "No chats match" : "No messages yet"}>
            {contacts.data.length ? "Try another name." : "When a shop messages you about an order, a price or a delivery, it shows up here."}
          </EmptyState>
        ) : null}
        {list.map((contact) => (
          <Pressable
            key={contact.id}
            accessibilityRole="button"
            accessibilityLabel={`${contact.name}${contact.unread ? `, ${contact.unread} unread` : ""}`}
            onPress={() => router.push({ pathname: `${base}/chat/[id]` as never, params: { id: contact.id, name: contact.name } })}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 12, opacity: pressed ? 0.8 : 1 })}
          >
            <Initials name={contact.name} bg={contact.role === "seller" ? colors.peach : colors.mintTint} fg={contact.role === "seller" ? colors.accentInk : colors.forest} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T weight={contact.unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{contact.name}</T>
                {contact.lastMessageAt ? <T style={{ color: colors.inkSoft, fontSize: 12 }}>{shortTime(contact.lastMessageAt)}</T> : null}
              </View>
              <T style={{ color: contact.unread ? colors.ink : colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{contact.lastMessage || "No messages yet"}</T>
              <T weight="semibold" style={{ fontSize: 11.5, color: colors.inkSoft }}>{ROLE_LABEL[contact.role] ?? "Partner"}</T>
            </View>
            {contact.unread ? (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 12 }}>{String(contact.unread)}</T>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </TabScreen>
  );
}

/** One conversation (?name= is shown while the messages load). */
export function ConversationScreen({ webPath }: { webPath: string }) {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const messages = useLoad(() => fetchPartnerMessages(String(id)), String(id));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = name || "Conversation";

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendPartnerMessage(String(id), text);
      setDraft("");
      messages.setData([...(messages.data ?? []), sent]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatScreen
      header={
        <>
          <Initials name={title} size={40} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{title}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>Messages on Shopinbos</T>
          </View>
        </>
      }
      refreshing={messages.refreshing}
      onRefresh={() => void messages.refresh()}
      scrollKey={messages.data?.length}
      composer={<Composer value={draft} onChange={setDraft} onSend={() => void send()} busy={sending} placeholder={`Message ${title}`} above={error ? <Notice>{error}</Notice> : null} />}
    >
      {messages.loading && !messages.data ? <LoadingBlock /> : null}
      {messages.error && !messages.data ? <ErrorState message={messages.error} onRetry={() => void messages.reload()} web={{ label: "Open on web", onPress: () => void openWeb(webPath) }} /> : null}
      {messages.data && !messages.data.length ? <T style={{ color: colors.inkSoft, textAlign: "center" }}>No messages yet. Say hello, or ask about an order.</T> : null}
      {messages.data?.map((message) => (
        <Bubble key={message.id} mine={message.mine} meta={shortTime(message.createdAt)}>{message.text}</Bubble>
      ))}
    </ChatScreen>
  );
}
