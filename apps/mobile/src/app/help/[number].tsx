import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Notice, T } from "@/components/ui";
import { friendlyTime } from "@/lib/friendly";
import { fetchSupportTicket, replySupportChat } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// One chat with the Shopinbos team (a support ticket): their replies and yours.
export default function SupportChat() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const ticket = useLoad(() => fetchSupportTicket(String(number)), String(number));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = ticket.data;

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      ticket.setData(await replySupportChat(String(number), draft.trim()));
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Your message didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatScreen
      header={
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>Shopinbos team</T>
          <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{data?.subject ?? " "}</T>
        </View>
      }
      refreshing={ticket.refreshing}
      onRefresh={() => void ticket.refresh()}
      scrollKey={data?.messages.length}
      composer={data && data.status !== "closed" ? <Composer value={draft} onChange={setDraft} onSend={() => void send()} busy={sending} placeholder="Write to the team" above={error ? <Notice>{error}</Notice> : null} /> : null}
    >
      {ticket.loading && !data ? <LoadingBlock /> : null}
      {ticket.error && !data ? <ErrorState message={ticket.error} onRetry={() => void ticket.reload()} /> : null}
      {data && !data.answered ? <Notice tone="info">We got your message. A person will answer here soon.</Notice> : null}
      {data?.messages.map((message) => (
        <Bubble key={message.id} mine={message.authorType === "user"} meta={`${message.authorType === "user" ? "You" : message.authorName ?? "Shopinbos"} · ${friendlyTime(message.createdAt)}`}>
          {message.body || "(a file, open it on the web to see it)"}
        </Bubble>
      ))}
      {data?.status === "closed" ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>This chat is closed. Start a new one from Help if you need us again.</T> : null}
    </ChatScreen>
  );
}
