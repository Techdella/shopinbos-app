import { useState } from "react";
import { View } from "react-native";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { PairsEditor } from "@/components/seller/ReplyEditors";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Mascot, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { fetchAutomation, saveAutomation, type ChatbotSettings, type InboxAutomation } from "@/lib/inbox";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// Peggy chatbot (web /home/inbox/chatbot): Peggy answers shoppers in the store's chat bubble. The app covers the
// switch, her name, greeting, tone, when she answers, what she may use and her questions and answers. Hand-off
// words keep what the web set.

// Labels are m_chats keys.
const SOURCES: Array<{ key: keyof ChatbotSettings["sources"]; label: "bot.source.products" | "bot.source.delivery" | "bot.source.policies" | "bot.source.faqs" }> = [
  { key: "products", label: "bot.source.products" },
  { key: "delivery", label: "bot.source.delivery" },
  { key: "policies", label: "bot.source.policies" },
  { key: "faqs", label: "bot.source.faqs" },
];

export default function Chatbot() {
  const t = useT("m_chats");
  const loaded = useLoad(fetchAutomation);
  if (!loaded.data) {
    return (
      <Screen title={t("auto.chatbot")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  return <ChatbotForm initial={loaded.data} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} />;
}

function ChatbotForm({ initial, refreshing, onRefresh }: { initial: InboxAutomation; refreshing: boolean; onRefresh: () => void }) {
  const t = useT("m_chats", "m_ui", "common");
  const [bot, setBot] = useState<ChatbotSettings>(initial.chatbot);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const ready = initial.ready;

  const setFaq = (index: number, patch: Partial<{ q: string; a: string }>) =>
    setBot({ ...bot, faqs: bot.faqs.map((faq, at) => (at === index ? { ...faq, ...patch } : faq)) });

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const faqs = bot.faqs.map((faq) => ({ q: faq.q.trim(), a: faq.a.trim() })).filter((faq) => faq.q && faq.a);
      const saved = await saveAutomation({ chatbot: { ...bot, faqs } });
      setBot(saved.chatbot);
      setNote({ tone: "success", text: bot.enabled ? t("bot.savedOn", { name: bot.name }) : t("bot.savedOff") });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={t("auto.chatbot")}
      sub={t("bot.sub")}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<PillButton title={t("save")} busy={saving} disabled={!ready} onPress={() => void save()} />}
    >
      {!ready ? <Notice tone="info">{t("bot.notReady")}</Notice> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mascot name="peggy" size={48} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{bot.enabled ? t("bot.answering", { name: bot.name }) : t("bot.notAnswering")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{bot.when === "always" ? t("bot.always") : t("bot.outside")}</T>
        </View>
        <Toggle on={bot.enabled} onChange={(on) => setBot({ ...bot, enabled: on })} label={t("bot.on")} />
      </Card>

      <Card style={{ gap: 8 }}>
        <Label>{t("bot.name")}</Label>
        <Field value={bot.name} onChangeText={(name) => setBot({ ...bot, name })} maxLength={40} />
        <Label>{t("bot.greeting")}</Label>
        <Field value={bot.greeting} onChangeText={(greeting) => setBot({ ...bot, greeting })} maxLength={300} multiline style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
        <VoiceInput value={bot.greeting} onChange={(greeting) => setBot({ ...bot, greeting })} maxLength={300} mode="replace" context="a greeting for customers" style={{ marginTop: 8 }} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Label>{t("bot.tone")}</Label>
        <Segmented
          options={[
            { value: "friendly", label: t("bot.tone.friendly") },
            { value: "professional", label: t("bot.tone.professional") },
            { value: "playful", label: t("bot.tone.playful") },
          ]}
          value={bot.tone}
          onChange={(tone) => setBot({ ...bot, tone })}
        />
        <Label>{t("bot.when")}</Label>
        <Segmented
          options={[
            { value: "always", label: t("bot.when.always") },
            { value: "outside_hours", label: t("bot.when.closed") },
          ]}
          value={bot.when}
          onChange={(when) => setBot({ ...bot, when })}
        />
      </Card>

      <Card style={{ paddingVertical: 2 }}>
        <T weight="bold" style={{ fontSize: 14, paddingTop: 14 }}>{t("bot.sources")}</T>
        {SOURCES.map((source) => (
          <View key={source.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, marginTop: source.key === "products" ? 10 : 0 }}>
            <T weight="semibold" style={{ flex: 1, fontSize: 15 }}>{t(source.label)}</T>
            <Toggle on={bot.sources[source.key]} onChange={(on) => setBot({ ...bot, sources: { ...bot.sources, [source.key]: on } })} label={t(source.label)} />
          </View>
        ))}
      </Card>

      <T weight="bold" style={{ fontSize: 16 }} accessibilityRole="header">{bot.faqs.length ? t("bot.faqsCount", { count: bot.faqs.length }) : t("bot.faqs")}</T>
      <PairsEditor
        items={bot.faqs.map((faq) => ({ a: faq.q, b: faq.a }))}
        onChange={(items) => setBot({ ...bot, faqs: items.map((item) => ({ q: item.a, a: item.b })) })}
        first={{ label: t("faq.question"), placeholder: t("faq.questionHint"), maxLength: 200 }}
        second={{ label: t("faq.answer"), placeholder: t("faq.answerHint"), maxLength: 1000 }}
        addLabel={t("faq.add")}
        max={30}
      />
    </Screen>
  );
}
