import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Notice, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { fetchPartnerMessages, sendPartnerMessage } from "@/lib/partners";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// A chat with one supplier or delivery partner (?name= is shown while the messages load).

export default function PartnerChat() {
  const t = useT("m_chats", "m_ui");
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const messages = useLoad(() => fetchPartnerMessages(String(id)), String(id));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = name || t("partners.partner");

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
      setError(sendError instanceof Error ? sendError.message : t("partners.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatScreen
      header={
        <>
          <Initials name={title} size={40} bg={colors.mintTint} fg={colors.forest} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{title}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{t("partners.onShopinbos")}</T>
          </View>
        </>
      }
      refreshing={messages.refreshing}
      onRefresh={() => void messages.refresh()}
      scrollKey={messages.data?.length}
      composer={<Composer value={draft} onChange={setDraft} onSend={() => void send()} busy={sending} placeholder={t("partners.messageTo", { name: title })} above={error ? <Notice>{error}</Notice> : null} />}
    >
      {messages.loading && !messages.data ? <LoadingBlock /> : null}
      {messages.error && !messages.data ? <ErrorState message={messages.error} onRetry={() => void messages.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/messages") }} /> : null}
      {messages.data && !messages.data.length ? <T style={{ color: colors.inkSoft, textAlign: "center" }}>{t("partners.noMessages")}</T> : null}
      {messages.data?.map((message) => (
        <Bubble key={message.id} mine={message.mine} meta={shortTime(message.createdAt, new Date(), t)}>{message.text}</Bubble>
      ))}
    </ChatScreen>
  );
}
