import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { fetchAutoReplySettings, fetchAutomation, saveAutoReplySettings, saveAutomation, type AutoReplyRules, type AutoReplySettings, type InboxAutomation } from "@/lib/inbox";
import { useLoad } from "@/lib/useLoad";
import { HoursEditor, PairsEditor, isClock } from "@/components/seller/ReplyEditors";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// Auto-replies (web /home/inbox/auto-replies): away message, instant "got your message" reply, opening hours per
// day and keyword replies, all edited here.

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
  const [pairs, setPairs] = useState(initial.automation.autoReply.keywords.map((k) => ({ a: k.keywords.join(", "), b: k.reply })));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const ready = initial.automation.ready;
  const aiAvailable = initial.settings.aiAvailable;

  async function save() {
    if (ready && rules.hours.enabled && Object.values(rules.hours.days).some((day) => day.open && !(isClock(day.from) && isClock(day.to)))) {
      setNote({ tone: "error", text: t("hours.badTime") });
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      const keywords = pairs
        .map((pair, index) => ({ id: rules.keywords[index]?.id ?? `k${Date.now()}${index}`, keywords: pair.a.split(",").map((word) => word.trim()).filter(Boolean), reply: pair.b.trim() }))
        .filter((rule) => rule.keywords.length && rule.reply);
      await saveAutoReplySettings({ autoReplyEnabled: settings.autoReplyEnabled, autoReplyMode: settings.autoReplyMode, awayMessage: settings.awayMessage });
      if (ready) {
        const saved = await saveAutomation({ autoReply: { ...rules, keywords } });
        setRules(saved.autoReply);
        setPairs(saved.autoReply.keywords.map((k) => ({ a: k.keywords.join(", "), b: k.reply })));
      }
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
            hint={pairs.length ? t("auto.keywordsCount", { count: pairs.length }) : t("auto.keywordsAdd")}
            on={rules.keywordsEnabled}
            onChange={(on) => setRules({ ...rules, keywordsEnabled: on })}
          />
        </Card>
      ) : null}

      {ready && rules.hours.enabled ? <HoursEditor days={rules.hours.days} onChange={(days) => setRules({ ...rules, hours: { ...rules.hours, days } })} /> : null}

      {ready && rules.keywordsEnabled ? (
        <PairsEditor
          items={pairs}
          onChange={setPairs}
          first={{ label: t("keywords.words"), placeholder: t("keywords.wordsHint"), maxLength: 300 }}
          second={{ label: t("keywords.reply"), placeholder: t("keywords.replyHint"), maxLength: 1000 }}
          addLabel={t("keywords.add")}
          max={20}
        />
      ) : null}

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="bot" label={t("auto.chatbot")} hint={t("auto.chatbotHint")} onPress={() => router.push("/inbox/chatbot")} />
      </Card>
    </Screen>
  );
}
