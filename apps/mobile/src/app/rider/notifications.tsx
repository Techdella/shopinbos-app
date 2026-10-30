import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { List, Row, Tile, Title } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { BackButton, Notice, T, Toggle } from "@/components/ui";
import { fetchRiderNotify, saveRiderNotify } from "@/lib/rider";
import { useRiderStrings } from "@/lib/rider-strings";
import { clockWords, type RiderNotifyPrefs } from "@shared/message-notifications";
import { colors } from "@/theme";

// Riders app › Me › Notifications: which new messages buzz the phone (from the company, from shops on a job) and
// quiet hours (Lagos time). Saved on the rider (/api/mobile/logistics/rider/notifications); messages always wait in
// the chat. Job alerts aren't switchable here: a new job always buzzes.

export default function RiderNotifications() {
  const params = useLocalSearchParams<{ company?: string }>();
  const { t, say } = useRiderStrings();
  const [prefs, setPrefs] = useState<RiderNotifyPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const company = params.company || say("notify.yourCompany");

  const load = () =>
    fetchRiderNotify()
      .then((next) => {
        setPrefs(next);
        setError(null);
      })
      .catch((loadError: Error) => setError(loadError.message));

  useEffect(() => {
    void load();
  }, []);

  async function change(patch: Parameters<typeof saveRiderNotify>[0], optimistic: RiderNotifyPrefs) {
    if (!prefs) return;
    const before = prefs;
    setPrefs(optimistic);
    setNote(null);
    try {
      setPrefs(await saveRiderNotify(patch));
    } catch {
      setPrefs(before);
      setNote(say("notify.saveFailed"));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 16 }}>
        <View style={{ flexDirection: "row" }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/rider/me"))} />
        </View>
        <Title>{say("notify.title")}</Title>
        <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{say("notify.sub")}</T>
        {note ? <Notice>{note}</Notice> : null}
        {!prefs && !error ? <LoadingBlock label={t.loading} /> : null}
        {error && !prefs ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {prefs ? (
          <>
            <List>
              <Row
                lead={<Tile icon="chat" />}
                title={say("notify.company", { company })}
                sub={say("notify.companyHint")}
                right={<Toggle on={prefs.company} label={say("notify.company", { company })} onChange={(on) => void change({ company: on }, { ...prefs, company: on })} />}
              />
              <Row
                lead={<Tile icon="store" />}
                title={say("notify.shops")}
                sub={say("notify.shopsHint")}
                right={<Toggle on={prefs.shops} label={say("notify.shops")} onChange={(on) => void change({ shops: on }, { ...prefs, shops: on })} />}
              />
            </List>
            <List>
              <Row
                lead={<Tile icon="moon" />}
                title={say("notify.quiet")}
                sub={prefs.quiet.enabled ? say("notify.quietOn", { start: clockWords(prefs.quiet.start), end: clockWords(prefs.quiet.end) }) : say("notify.quietOff")}
                right={<Toggle on={prefs.quiet.enabled} label={say("notify.quiet")} onChange={(on) => void change({ quiet: { enabled: on } }, { ...prefs, quiet: { ...prefs.quiet, enabled: on } })} />}
              />
            </List>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{say("notify.jobsNote")}</T>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
