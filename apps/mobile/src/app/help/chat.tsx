import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Field, Notice, PillButton, T } from "@/components/ui";
import { startSupportChat } from "@/lib/support";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";
import { useT } from "@/lib/i18n";

// "Chat with a person" when there's no WhatsApp number: one question, then the conversation with the team.
export default function NewSupportChat() {
  const t = useT("m_help");
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!message.trim()) return setError(t("chat.empty"));
    setBusy(true);
    setError(null);
    try {
      const ticket = await startSupportChat(message.trim(), from ? String(from) : "help");
      router.replace({ pathname: "/help/[number]", params: { number: String(ticket.number) } });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("chat.sendFailed"));
      setBusy(false);
    }
  }

  return (
    <Screen title={t("chat.title")} sub={t("chat.sub")} footer={<PillButton title={t("chat.send")} busy={busy} onPress={() => void send()} />}>
      <Field value={message} onChangeText={setMessage} multiline maxLength={5000} autoFocus placeholder={t("chat.placeholder")} accessibilityLabel={t("chat.title")} style={{ height: 160, paddingTop: 14, textAlignVertical: "top", fontSize: 17 }} />
      <VoiceInput value={message} onChange={setMessage} maxLength={5000} context="a message to the support team" />
      {error ? <Notice>{error}</Notice> : null}
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("chat.hours")}</T>
    </Screen>
  );
}
