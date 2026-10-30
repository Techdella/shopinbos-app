import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Notice, T } from "@/components/ui";
import { friendlyTime } from "@/lib/friendly";
import { fetchSupportTicket, replySupportChat } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One chat with the Shopinbos team (a support ticket): their replies and yours.
export default function SupportChat() {
  const t = useT("m_help", "m_ui");
  const { number } = useLocalSearchParams<{ number: string }>();
  const ticket = useLoad(() => fetchSupportTicket(String(number)), String(number));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = ticket.data;

  async function send(spoken?: string) {
    const text = (spoken ?? draft).trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      ticket.setData(await replySupportChat(String(number), text));
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("chat.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatScreen
      header={
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{t("ticket.team")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{data?.subject ?? " "}</T>
        </View>
      }
      refreshing={ticket.refreshing}
      onRefresh={() => void ticket.refresh()}
      scrollKey={data?.messages.length}
      composer={data && data.status !== "closed" ? <Composer value={draft} onChange={setDraft} onSend={(text) => void send(text)} busy={sending} placeholder={t("ticket.write")} above={error ? <Notice>{error}</Notice> : null} /> : null}
    >
      {ticket.loading && !data ? <LoadingBlock /> : null}
      {ticket.error && !data ? <ErrorState message={ticket.error} onRetry={() => void ticket.reload()} /> : null}
      {data && !data.answered ? <Notice tone="info">{t("ticket.got")}</Notice> : null}
      {data?.messages.map((message) => (
        <Bubble key={message.id} mine={message.authorType === "user"} meta={`${message.authorType === "user" ? t("ticket.you") : message.authorName ?? "Shopinbos"} · ${friendlyTime(message.createdAt, new Date(), t)}`}>
          {message.body || t("ticket.file")}
        </Bubble>
      ))}
      {data?.status === "closed" ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15 }}>{t("ticket.closedNote")}</T> : null}
    </ChatScreen>
  );
}
