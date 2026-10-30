import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Card, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { fetchNotificationSettings, saveNotificationSettings, sendTestNotification, type NotificationSettings } from "@/lib/notifications";
import { pushPermission, pushSupported, pushTurnedOffHere, turnOnPush, unregisterPushDevice, type PushPermission } from "@/lib/push";
import type { NotifyCategory } from "@shared/notifications";
import type { MessageSource } from "@shared/message-notifications";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Notification settings on the phone: push on this phone, which kinds of update buzz it, new messages (push per
// source for delivery partners, the unread-message email), quiet hours and a test. The other email, SMS and
// WhatsApp choices are on the website (Settings › Notifications).

function hourWords(value: string, t: ReturnType<typeof useT<["m_notifications"]>>) {
  const hour = Number(value.slice(0, 2));
  return hour === 0 ? t("quiet.midnight") : hour === 12 ? t("quiet.noon") : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export default function NotificationSettingsScreen() {
  const t = useT("m_notifications");
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [offHere, setOffHere] = useState(pushTurnedOffHere());

  const load = () =>
    fetchNotificationSettings()
      .then((next) => {
        setSettings(next);
        setError(null);
      })
      .catch((loadError: Error) => setError(loadError.message));
  useEffect(() => {
    void fetchNotificationSettings().then(setSettings).catch((loadError: Error) => setError(loadError.message));
    void pushPermission().then(setPermission);
  }, []);

  const save = async (body: Parameters<typeof saveNotificationSettings>[0], optimistic: (current: NotificationSettings) => NotificationSettings) => {
    if (!settings) return;
    const before = settings;
    setSettings(optimistic(settings));
    try {
      setSettings(await saveNotificationSettings(body));
    } catch (saveError) {
      setSettings(before);
      setNote(saveError instanceof Error ? saveError.message : t("settings.saveFailed"));
    }
  };

  const setPush = (key: NotifyCategory, on: boolean) =>
    save({ categories: { [key]: { push: on } } }, (current) => ({ ...current, categories: current.categories.map((row) => (row.key === key ? { ...row, channels: { ...row.channels, push: on } } : row)) }));

  const setSourcePush = (source: MessageSource, on: boolean) =>
    save({ messages: { sources: { [source]: { push: on } } } }, (current) => ({
      ...current,
      messages: current.messages ? { ...current.messages, sources: current.messages.sources.map((row) => (row.key === source ? { ...row, push: on } : row)) } : current.messages,
    }));

  const setUnreadEmail = (on: boolean) =>
    save({ messages: { unreadEmail: on } }, (current) => ({ ...current, messages: current.messages ? { ...current.messages, unreadEmail: on } : current.messages }));

  const sourceWords = (key: MessageSource) =>
    key === "riders"
      ? { label: t("messages.fromRiders"), help: t("messages.fromRidersHelp") }
      : key === "business"
      ? { label: t("messages.fromBusiness"), help: t("messages.fromBusinessHelp") }
      : { label: t("messages.fromCustomers"), help: t("messages.fromCustomersHelp") };

  const messages = settings?.messages;
  const phoneOn = permission === "granted" && !offHere;

  return (
    <Screen title={t("settings.title")} sub={t("settings.sub")}>
      {note ? <Notice tone="info">{note}</Notice> : null}

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{t("settings.phone")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>
              {!pushSupported || permission === "unsupported"
                ? t("settings.unsupported")
                : permission === "denied"
                ? t("settings.denied")
                : phoneOn
                ? t("settings.on")
                : t("settings.off")}
            </T>
          </View>
          {permission === "granted" || permission === "undetermined" ? (
            <Toggle
              on={phoneOn}
              label={t("settings.phone")}
              onChange={async (on) => {
                if (on) {
                  setPermission(await turnOnPush());
                  setOffHere(false);
                } else {
                  setOffHere(true);
                  await unregisterPushDevice({ turnOff: true });
                }
              }}
            />
          ) : null}
        </View>
        {permission === "denied" ? <PillButton title={t("settings.openPhone")} tone="white" size="sm" onPress={() => void Linking.openSettings()} /> : null}
        <PillButton
          title={t("settings.test")}
          tone="white"
          size="sm"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const result = await sendTestNotification();
              setNote(result.devices ? t("settings.testSent") : t("settings.testBell"));
            } catch (testError) {
              setNote(testError instanceof Error ? testError.message : t("settings.testFailed"));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>

      {!settings && !error ? <LoadingBlock /> : null}
      {error && !settings ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {settings ? (
        <>
          <Card style={{ gap: 4 }}>
            <T weight="extrabold" style={{ fontSize: 16, marginBottom: 4 }}>{t("settings.buzzFor")}</T>
            {settings.categories.map((row, index) => (
              <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 15.5 }}>{t.dynamic(`category.${row.key}`, row.label)}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{t.dynamic(`help.${row.key}`, row.help)}</T>
                </View>
                <Toggle on={row.channels.push} label={t("settings.rowLabel", { category: t.dynamic(`category.${row.key}`, row.label) })} onChange={(on) => void setPush(row.key, on)} />
              </View>
            ))}
          </Card>

          {messages && (messages.sources.length > 0 || messages.unreadEmail !== null) ? (
            <Card style={{ gap: 4 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("messages.title")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19, marginBottom: 4 }}>{messages.push ? t("messages.text") : t("messages.pushOff")}</T>
              {messages.push
                ? messages.sources.map((row) => {
                    const words = sourceWords(row.key);
                    return (
                      <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
                        <View style={{ flex: 1 }}>
                          <T weight="bold" style={{ fontSize: 15.5 }}>{words.label}</T>
                          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{words.help}</T>
                        </View>
                        <Toggle on={row.push} label={t("messages.pushFor", { source: words.label })} onChange={(on) => void setSourcePush(row.key, on)} />
                      </View>
                    );
                  })
                : null}
              {messages.unreadEmail !== null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <View style={{ flex: 1 }}>
                    <T weight="bold" style={{ fontSize: 15.5 }}>{t("messages.unreadEmail")}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{t("messages.unreadEmailHelp")}</T>
                  </View>
                  <Toggle on={messages.unreadEmail} label={t("messages.unreadEmail")} onChange={(on) => void setUnreadEmail(on)} />
                </View>
              ) : null}
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 4 }}>{t("messages.quietNote")}</T>
            </Card>
          ) : null}

          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 16 }}>{t("quiet.title")}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>
                  {settings.quietHours.enabled
                    ? t("quiet.on", { start: hourWords(settings.quietHours.start, t), end: hourWords(settings.quietHours.end, t) })
                    : t("quiet.off")}
                </T>
              </View>
              <Toggle
                on={settings.quietHours.enabled}
                label={t("quiet.title")}
                onChange={(on) => void save({ quietHours: { enabled: on } }, (current) => ({ ...current, quietHours: { ...current.quietHours, enabled: on } }))}
              />
            </View>
          </Card>

          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("settings.web")}</T>
        </>
      ) : null}
    </Screen>
  );
}
