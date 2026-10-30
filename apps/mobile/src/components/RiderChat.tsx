import { useState } from "react";
import { View } from "react-native";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { Small } from "@/components/design";
import { ErrorState, Initials, LoadingBlock } from "@/components/kit";
import { Notice, T } from "@/components/ui";
import { shortTime } from "@/lib/inbox-pure";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// One rider chat thread (shared/rider-chat.ts), the same screen for all three sides: the rider (with their company or
// with the shop on a job), the delivery company (with one rider) and the shop (with the rider carrying its parcel).

export interface RiderChatLine {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
}

export function RiderChat({
  title,
  subtitle,
  loadKey,
  load,
  send,
  backTo,
}: {
  title: string;
  subtitle: string;
  loadKey: string;
  load: () => Promise<RiderChatLine[]>;
  send: (body: string) => Promise<RiderChatLine>;
  backTo: string;
}) {
  const t = useT("m_ui");
  const messages = useLoad(load, loadKey);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = messages.data ?? [];

  async function submit(text = draft.trim()) {
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await send(text);
      setDraft("");
      messages.setData([...(messages.data ?? []), sent]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t("riderChat.failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatScreen
      help={false}
      backTo={backTo}
      header={
        <>
          <Initials name={title} size={40} bg={colors.mintTint} fg={colors.forest} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{title}</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>{subtitle}</T>
          </View>
        </>
      }
      refreshing={messages.refreshing}
      onRefresh={() => void messages.refresh()}
      scrollKey={list.length}
      composer={
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(text) => void submit(text?.trim() ?? draft.trim())}
          busy={sending}
          voice={false}
          placeholder={t("riderChat.placeholder", { name: title })}
          above={error ? <Notice>{error}</Notice> : null}
        />
      }
    >
      {messages.loading && !messages.data ? <LoadingBlock /> : null}
      {messages.error && !messages.data ? <ErrorState message={messages.error} onRetry={() => void messages.reload()} /> : null}
      {messages.data && !messages.data.length ? <Small style={{ textAlign: "center" }}>{t("riderChat.empty")}</Small> : null}
      {list.map((message) => (
        <Bubble key={message.id} mine={message.mine} meta={shortTime(message.createdAt)}>{message.body}</Bubble>
      ))}
    </ChatScreen>
  );
}
