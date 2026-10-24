import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { fetchAutoReplySettings, fetchAutomation, saveAutoReplySettings, saveAutomation, type AutoReplyRules, type AutoReplySettings, type InboxAutomation } from "@/lib/inbox";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// Auto-replies (web /home/inbox/auto-replies), the everyday switches: away message, instant "got your message"
// reply, opening hours and keyword replies on or off. Hours per day and the keyword list are edited on the web.

function SwitchRow({ title, hint, on, onChange, first }: { title: string; hint: string; on: boolean; onChange: (on: boolean) => void; first?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <View style={{ flex: 1 }}>
        <T weight="bold" style={{ fontSize: 15 }}>{title}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2, lineHeight: 18 }}>{hint}</T>
      </View>
      <Toggle on={on} onChange={onChange} label={title} />
    </View>
  );
}

export default function AutoReplies() {
  const t = useT("m_chats");
  const loaded = useLoad(async () => {
    const [settings, automation] = await Promise.all([fetchAutoReplySettings(), fetchAutomation()]);
    return { settings, automation };
  });
  if (!loaded.data) {
    return (
      <Screen title={t("list.autoReplies")} sub={t("auto.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  return <AutoRepliesForm initial={loaded.data} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} />;
}

function AutoRepliesForm({ initial, refreshing, onRefresh }: { initial: { settings: AutoReplySettings & { aiAvailable: boolean }; automation: InboxAutomation }; refreshing: boolean; onRefresh: () => void }) {
  const t = useT("m_chats", "m_ui", "common");
  const [settings, setSettings] = useState<AutoReplySettings>(initial.settings);
  const [rules, setRules] = useState<AutoReplyRules>(initial.automation.autoReply);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const ready = initial.automation.ready;
  const aiAvailable = initial.settings.aiAvailable;

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      await saveAutoReplySettings({ autoReplyEnabled: settings.autoReplyEnabled, autoReplyMode: settings.autoReplyMode, awayMessage: settings.awayMessage });
      if (ready) await saveAutomation({ autoReply: rules });
      setNote({ tone: "success", text: t("auto.saved") });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={t("list.autoReplies")}
      sub={t("auto.sub")}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<PillButton title={t("save")} busy={saving} onPress={() => void save()} />}
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card style={{ paddingVertical: 2 }}>
        <SwitchRow first title={t("auto.away")} hint={t("auto.awayHint")} on={settings.autoReplyEnabled} onChange={(on) => setSettings({ ...settings, autoReplyEnabled: on })} />
      </Card>
      {settings.autoReplyEnabled ? (
        <Card style={{ gap: 12 }}>
          {aiAvailable ? (
            <Segmented
              options={[
                { value: "message", label: t("auto.myMessage") },
                { value: "peggy", label: t("auto.peggyAnswers") },
              ]}
              value={settings.autoReplyMode}
              onChange={(mode) => setSettings({ ...settings, autoReplyMode: mode })}
            />
          ) : null}
          {settings.autoReplyMode === "peggy" && aiAvailable ? (
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t("auto.peggyHint")}</T>
          ) : (
            <>
              <Label>{t("auto.yourAway")}</Label>
              <Field value={settings.awayMessage} onChangeText={(text) => setSettings({ ...settings, awayMessage: text })} placeholder={t("auto.defaultAway")} multiline maxLength={600} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
              <VoiceInput value={settings.awayMessage} onChange={(text) => setSettings({ ...settings, awayMessage: text })} maxLength={600} mode="replace" context="an away message for customers" style={{ marginTop: 8 }} />
            </>
          )}
        </Card>
      ) : null}

      {!ready ? <Notice tone="info">{t("auto.notReady")}</Notice> : null}

      {ready ? (
        <Card style={{ paddingVertical: 2 }}>
          <SwitchRow first title={t("auto.instant")} hint={rules.ack.message} on={rules.ack.enabled} onChange={(on) => setRules({ ...rules, ack: { ...rules.ack, enabled: on } })} />
          <SwitchRow title={t("auto.hours")} hint={rules.hours.enabled ? t("auto.hoursOn") : t("auto.hoursOff")} on={rules.hours.enabled} onChange={(on) => setRules({ ...rules, hours: { ...rules.hours, enabled: on } })} />
          <SwitchRow
            title={t("auto.keywords")}
            hint={rules.keywords.length ? t("auto.keywordsCount", { count: rules.keywords.length }) : t("auto.keywordsNone")}
            on={rules.keywordsEnabled}
            onChange={(on) => setRules({ ...rules, keywordsEnabled: on })}
          />
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="bot" label={t("auto.chatbot")} hint={t("auto.chatbotHint")} onPress={() => router.push("/inbox/chatbot")} />
      </Card>
    </Screen>
  );
}
