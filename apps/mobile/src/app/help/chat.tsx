import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Field, Notice, PillButton, T } from "@/components/ui";
import { startSupportChat } from "@/lib/support";
import { colors } from "@/theme";

// "Chat with a person" when there's no WhatsApp number: one question, then the conversation with the team.
export default function NewSupportChat() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!message.trim()) return setError("Type what you need help with first. A few words is enough.");
    setBusy(true);
    setError(null);
    try {
      const ticket = await startSupportChat(message.trim(), from ? String(from) : "help");
      router.replace({ pathname: "/help/[number]", params: { number: String(ticket.number) } });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Your message didn't send. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Screen title="What do you need help with?" sub="A person from Shopinbos reads this and answers you here." footer={<PillButton title="Send to the team" busy={busy} onPress={() => void send()} />}>
      <Field value={message} onChangeText={setMessage} multiline maxLength={5000} autoFocus placeholder="For example: my customer paid but the order says not paid" accessibilityLabel="What do you need help with?" style={{ height: 160, paddingTop: 14, textAlignVertical: "top", fontSize: 17 }} />
      {error ? <Notice>{error}</Notice> : null}
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>We usually answer within a few hours, 8am to 8pm. You&apos;ll get a message when we reply.</T>
    </Screen>
  );
}
