import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { fetchAutoReplySettings, fetchAutomation, saveAutoReplySettings, saveAutomation, type AutoReplyRules, type AutoReplySettings, type InboxAutomation } from "@/lib/inbox";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// Auto-replies (web /home/inbox/auto-replies), the everyday switches: away message, instant "got your message"
// reply, opening hours and keyword replies on or off. Hours per day and the keyword list are edited on the web.

const DEFAULT_AWAY = "Thanks for your message! We're away right now and will reply as soon as we're back.";

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
  const loaded = useLoad(async () => {
    const [settings, automation] = await Promise.all([fetchAutoReplySettings(), fetchAutomation()]);
    return { settings, automation };
  });
  if (!loaded.data) {
    return (
      <Screen title="Replies when you're busy" sub="Answer customers on WhatsApp, Instagram and your shop while you're busy or closed." refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  return <AutoRepliesForm initial={loaded.data} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()} />;
}

function AutoRepliesForm({ initial, refreshing, onRefresh }: { initial: { settings: AutoReplySettings & { aiAvailable: boolean }; automation: InboxAutomation }; refreshing: boolean; onRefresh: () => void }) {
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
      setNote({ tone: "success", text: "Saved. New messages get these replies straight away." });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : "That didn't save. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Replies when you're busy"
      sub="Answer customers on WhatsApp, Instagram and your shop while you're busy or closed."
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<PillButton title="Save" busy={saving} onPress={() => void save()} />}
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <Card style={{ paddingVertical: 2 }}>
        <SwitchRow first title="Away message" hint="Sent when someone writes and you haven't been on Shopinbos for a while, or outside your hours." on={settings.autoReplyEnabled} onChange={(on) => setSettings({ ...settings, autoReplyEnabled: on })} />
      </Card>
      {settings.autoReplyEnabled ? (
        <Card style={{ gap: 12 }}>
          {aiAvailable ? (
            <Segmented
              options={[
                { value: "message", label: "My message" },
                { value: "peggy", label: "Peggy answers" },
              ]}
              value={settings.autoReplyMode}
              onChange={(mode) => setSettings({ ...settings, autoReplyMode: mode })}
            />
          ) : null}
          {settings.autoReplyMode === "peggy" && aiAvailable ? (
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>Peggy replies with real answers about your products, prices and delivery, and says you&apos;ll follow up on anything else.</T>
          ) : (
            <>
              <Label>Your away message</Label>
              <Field value={settings.awayMessage} onChangeText={(text) => setSettings({ ...settings, awayMessage: text })} placeholder={DEFAULT_AWAY} multiline maxLength={600} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
              <VoiceInput value={settings.awayMessage} onChange={(text) => setSettings({ ...settings, awayMessage: text })} maxLength={600} mode="replace" context="an away message for customers" style={{ marginTop: 8 }} />
            </>
          )}
        </Card>
      ) : null}

      {!ready ? <Notice tone="info">Quick replies and opening hours aren&apos;t switched on for your shop yet. The away message works now. Tap Help and we&apos;ll switch the rest on.</Notice> : null}

      {ready ? (
        <Card style={{ paddingVertical: 2 }}>
          <SwitchRow first title="Instant reply while you're open" hint={rules.ack.message} on={rules.ack.enabled} onChange={(on) => setRules({ ...rules, ack: { ...rules.ack, enabled: on } })} />
          <SwitchRow title="Opening hours" hint={rules.hours.enabled ? "Away message goes out outside your hours." : "Off: the away message only goes out when you're away."} on={rules.hours.enabled} onChange={(on) => setRules({ ...rules, hours: { ...rules.hours, enabled: on } })} />
          <SwitchRow
            title="Keyword replies"
            hint={rules.keywords.length ? `${rules.keywords.length} quick repl${rules.keywords.length === 1 ? "y" : "ies"} for words like “price” or “delivery”.` : "Add replies for words like “price” or “delivery” on the web."}
            on={rules.keywordsEnabled}
            onChange={(on) => setRules({ ...rules, keywordsEnabled: on })}
          />
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="clock" label="Opening hours and quick replies" hint="Change them in your browser" onPress={() => void openWeb("/home/inbox/auto-replies")} />
        <LinkRow icon="bot" label="Peggy answers shoppers" hint="On your shop's chat, day and night" onPress={() => router.push("/inbox/chatbot")} />
      </Card>
    </Screen>
  );
}
