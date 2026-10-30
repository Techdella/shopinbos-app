import { useState } from "react";
import { Alert, Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import { AppearanceRow } from "@/components/AppearancePicker";
import { List, Row, Tile } from "@/components/design";
import { HelpSheet } from "@/components/Help";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { RiderBadge } from "@/components/RiderKit";
import { TabScreen } from "@/components/TabScreen";
import { Sheet } from "@/components/Sheet";
import { Field, Notice, PillButton } from "@/components/ui";
import { fetchRider, forgetRiderToken, riderAction } from "@/lib/rider";
import { unregisterPushDevice } from "@/lib/push";
import { initials } from "@/lib/rider-pure";
import { RIDER_LANGS, useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Riders app, Me (E2E-Rider "me"): name and company, language, the bike's plate (the rider or the company types it),
// call the company, Help, and removing the Riders link from this phone (log out).

export default function RiderMe() {
  const rider = useLoad(fetchRider);
  const { lang, t, say } = useRiderStrings();
  const [help, setHelp] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [saving, setSaving] = useState(false);
  const [plateError, setPlateError] = useState<string | null>(null);
  const data = rider.data;
  const company = data?.rider.partnerName ?? "";
  const language = RIDER_LANGS.find((item) => item.code === lang)?.label ?? "English";

  async function goOut() {
    // The phone stops getting job alerts (needs the link, so before forgetting it), then the rider screens close.
    await unregisterPushDevice().catch(() => null);
    forgetRiderToken();
    if (router.canDismiss()) router.dismissAll();
    router.replace("/welcome");
  }

  function leave() {
    // Alert.alert does nothing on the web build, so the web asks with the browser's own box.
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${t.removeTitle}\n\n${t.removeBody}`)) void goOut();
      return;
    }
    Alert.alert(t.removeTitle, t.removeBody, [
      { text: t.keep, style: "cancel" },
      { text: t.remove, style: "destructive", onPress: () => void goOut() },
    ]);
  }

  async function savePlate() {
    setSaving(true);
    setPlateError(null);
    try {
      await riderAction({ action: "plate", plate });
      setPlateOpen(false);
      void rider.refresh();
    } catch (error) {
      setPlateError(error instanceof Error ? error.message : say("me.plateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <TabScreen title={say("me.title")} refreshing={rider.refreshing} onRefresh={() => void rider.refresh()}>
      {rider.loading && !data ? <LoadingBlock label={t.loading} /> : null}
      {rider.error && !data ? <ErrorState message={rider.error} onRetry={() => void rider.reload()} /> : null}
      {data ? (
        <List>
          <Row lead={<RiderBadge label={initials(data.rider.name)} />} title={data.rider.name} sub={say("me.riderFor", { company })} />
          <Row lead={<Tile icon="globe" />} title={t.language} sub={language} onPress={() => router.push({ pathname: "/rider/language", params: { id: data.rider.id ?? "" } })} />
          <AppearanceRow tile />
          <Row
            lead={<Tile icon="truck" />}
            title={say("me.bike")}
            sub={data.rider.plate || say("me.addPlate")}
            chevron
            onPress={() => {
              setPlate(data.rider.plate ?? "");
              setPlateError(null);
              setPlateOpen(true);
            }}
          />
        </List>
      ) : null}
      <List>
        {data?.rider.partnerPhone ? <Row lead={<Tile icon="phone" />} title={t.callCompany({ name: company })} onPress={() => void Linking.openURL(`tel:${data.rider.partnerPhone}`)} /> : null}
        <Row lead={<Tile icon="help" />} title={say("me.help")} onPress={() => setHelp(true)} />
        <Row lead={<Tile icon="logout" />} title={t.removeLink} titleStyle={{ color: colors.danger }} onPress={leave} />
      </List>
      <HelpSheet visible={help} onClose={() => setHelp(false)} />
      <Sheet visible={plateOpen} onClose={() => setPlateOpen(false)} title={say("me.plateTitle")}>
        <View style={{ gap: 12 }}>
          <Field value={plate} onChangeText={setPlate} autoCapitalize="characters" autoCorrect={false} maxLength={20} placeholder="LSR 482 KJ" accessibilityLabel={say("me.plateTitle")} />
          {plateError ? <Notice>{plateError}</Notice> : null}
          <PillButton title={say("me.plateSave")} busy={saving} onPress={() => void savePlate()} />
        </View>
      </Sheet>
    </TabScreen>
  );
}
