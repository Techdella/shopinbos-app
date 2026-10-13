import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Card, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { fetchNotificationSettings, saveNotificationSettings, sendTestNotification, type NotificationSettings } from "@/lib/notifications";
import { pushPermission, pushSupported, pushTurnedOffHere, turnOnPush, unregisterPushDevice, type PushPermission } from "@/lib/push";
import type { NotifyCategory } from "@shared/notifications";
import { colors } from "@/theme";

// Notification settings on the phone: push on this phone, which kinds of update buzz it, quiet hours and a test.
// Email, SMS and WhatsApp choices are on the website (Settings › Notifications).

function hourWords(value: string) {
  const hour = Number(value.slice(0, 2));
  return hour === 0 ? "midnight" : hour === 12 ? "noon" : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export default function NotificationSettingsScreen() {
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
      setNote(saveError instanceof Error ? saveError.message : "We couldn't save that. Try again.");
    }
  };

  const setPush = (key: NotifyCategory, on: boolean) =>
    save({ categories: { [key]: { push: on } } }, (current) => ({ ...current, categories: current.categories.map((row) => (row.key === key ? { ...row, channels: { ...row.channels, push: on } } : row)) }));

  const phoneOn = permission === "granted" && !offHere;

  return (
    <Screen title="Notification settings" sub="Choose what buzzes your phone.">
      {note ? <Notice tone="info">{note}</Notice> : null}

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>Notifications on this phone</T>
            <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>
              {!pushSupported || permission === "unsupported"
                ? "This version of the app can't get notifications. Install Shopinbos from the app store."
                : permission === "denied"
                ? "Turned off in your phone's settings. Open Settings to turn them on."
                : phoneOn
                ? "On. You'll get alerts even when the app is closed."
                : "Off. Turn on to hear about orders and messages straight away."}
            </T>
          </View>
          {permission === "granted" || permission === "undetermined" ? (
            <Toggle
              on={phoneOn}
              label="Notifications on this phone"
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
        {permission === "denied" ? <PillButton title="Open phone settings" tone="white" size="sm" onPress={() => void Linking.openSettings()} /> : null}
        <PillButton
          title="Send me a test notification"
          tone="white"
          size="sm"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const result = await sendTestNotification();
              setNote(result.devices ? "Test sent. It should arrive in a few seconds." : "Test sent to your bell. Turn on notifications to get it on your phone too.");
            } catch (testError) {
              setNote(testError instanceof Error ? testError.message : "We couldn't send a test.");
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
            <T weight="extrabold" style={{ fontSize: 16, marginBottom: 4 }}>Buzz my phone for</T>
            {settings.categories.map((row, index) => (
              <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 15.5 }}>{row.label}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{row.help}</T>
                </View>
                <Toggle on={row.channels.push} label={`${row.label} notifications`} onChange={(on) => void setPush(row.key, on)} />
              </View>
            ))}
          </Card>

          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="extrabold" style={{ fontSize: 16 }}>Quiet hours</T>
                <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>
                  {settings.quietHours.enabled
                    ? `No buzzing from ${hourWords(settings.quietHours.start)} to ${hourWords(settings.quietHours.end)}. You get one summary in the morning. Urgent things still come through.`
                    : "Off. Notifications can buzz at any time."}
                </T>
              </View>
              <Toggle
                on={settings.quietHours.enabled}
                label="Quiet hours"
                onChange={(on) => void save({ quietHours: { enabled: on } }, (current) => ({ ...current, quietHours: { ...current.quietHours, enabled: on } }))}
              />
            </View>
          </Card>

          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>Email, SMS and WhatsApp choices, and the exact quiet hours, are in Settings › Notifications on the website.</T>
        </>
      ) : null}
    </Screen>
  );
}
