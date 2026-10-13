import { useState } from "react";
import { View } from "react-native";
import { ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Mascot, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { fetchAutomation, saveAutomation, type ChatbotSettings, type InboxAutomation } from "@/lib/inbox";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// Peggy chatbot (web /home/inbox/chatbot): Peggy answers shoppers in the store's chat bubble. The app covers the
// switch, her name, greeting, tone, when she answers and what she may use; FAQs and hand-off words are on the web.

const SOURCES: Array<{ key: keyof ChatbotSettings["sources"]; label: string }> = [
  { key: "products", label: "Products and prices" },
  { key: "delivery", label: "Delivery areas and fees" },
  { key: "policies", label: "Your policies" },
  { key: "faqs", label: "Your FAQs" },
];

export default function Chatbot() {
  const loaded = useLoad(fetchAutomation);
  if (!loaded.data) {
    return (
      <Screen title="Peggy answers shoppers" refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  return <ChatbotForm initial={loaded.data} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} />;
}

function ChatbotForm({ initial, refreshing, onRefresh }: { initial: InboxAutomation; refreshing: boolean; onRefresh: () => void }) {
  const [bot, setBot] = useState<ChatbotSettings>(initial.chatbot);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const ready = initial.ready;

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const saved = await saveAutomation({ chatbot: bot });
      setBot(saved.chatbot);
      setNote({ tone: "success", text: bot.enabled ? `Saved. ${bot.name} is answering on your shop.` : "Saved. Peggy won't answer shoppers for now." });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : "That didn't save. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Peggy answers shoppers"
      sub="Answers shoppers on your store's chat, day and night, and hands over to you when they ask for a person."
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<PillButton title="Save" busy={saving} disabled={!ready} onPress={() => void save()} />}
    >
      {!ready ? <Notice tone="info">Peggy can&apos;t answer shoppers on your shop yet. Tap Help and we&apos;ll switch it on for you.</Notice> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mascot name="peggy" size={48} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{bot.enabled ? `${bot.name} is answering` : "Peggy isn't answering"}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{bot.when === "always" ? "Answers every chat" : "Answers outside your opening hours"}</T>
        </View>
        <Toggle on={bot.enabled} onChange={(on) => setBot({ ...bot, enabled: on })} label="Peggy answers shoppers" />
      </Card>

      <Card style={{ gap: 8 }}>
        <Label>Name</Label>
        <Field value={bot.name} onChangeText={(name) => setBot({ ...bot, name })} maxLength={40} />
        <Label>Greeting</Label>
        <Field value={bot.greeting} onChangeText={(greeting) => setBot({ ...bot, greeting })} maxLength={300} multiline style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
        <VoiceInput value={bot.greeting} onChange={(greeting) => setBot({ ...bot, greeting })} maxLength={300} mode="replace" context="a greeting for customers" style={{ marginTop: 8 }} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Label>Tone</Label>
        <Segmented
          options={[
            { value: "friendly", label: "Friendly" },
            { value: "professional", label: "Formal" },
            { value: "playful", label: "Playful" },
          ]}
          value={bot.tone}
          onChange={(tone) => setBot({ ...bot, tone })}
        />
        <Label>When she answers</Label>
        <Segmented
          options={[
            { value: "always", label: "Always" },
            { value: "outside_hours", label: "When closed" },
          ]}
          value={bot.when}
          onChange={(when) => setBot({ ...bot, when })}
        />
      </Card>

      <Card style={{ paddingVertical: 2 }}>
        <T weight="bold" style={{ fontSize: 14, paddingTop: 14 }}>What she can use to answer</T>
        {SOURCES.map((source) => (
          <View key={source.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, marginTop: source.key === "products" ? 10 : 0 }}>
            <T weight="semibold" style={{ flex: 1, fontSize: 15 }}>{source.label}</T>
            <Toggle on={bot.sources[source.key]} onChange={(on) => setBot({ ...bot, sources: { ...bot.sources, [source.key]: on } })} label={source.label} />
          </View>
        ))}
      </Card>

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="doc" label={`Questions and answers${bot.faqs.length ? ` (${bot.faqs.length})` : ""}`} hint="Change them and try Peggy out in your browser" onPress={() => void openWeb("/home/inbox/chatbot")} />
      </Card>
    </Screen>
  );
}
