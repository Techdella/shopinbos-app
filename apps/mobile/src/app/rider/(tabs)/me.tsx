import { useState } from "react";
import { Alert, Linking } from "react-native";
import { router } from "expo-router";
import { AppearanceRow } from "@/components/AppearancePicker";
import { List, Row, Tile } from "@/components/design";
import { HelpSheet } from "@/components/Help";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { RiderBadge } from "@/components/RiderKit";
import { TabScreen } from "@/components/TabScreen";
import { fetchRider, forgetRiderToken } from "@/lib/rider";
import { initials } from "@/lib/rider-pure";
import { RIDER_LANGS, useRiderStrings } from "@/lib/rider-strings";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Riders app, Me (E2E-Rider "me"): name and company, language, the bike's plate (the company types it), call the
// company, Help, and removing the Riders link from this phone.

export default function RiderMe() {
  const rider = useLoad(fetchRider);
  const { lang, t, say } = useRiderStrings();
  const [help, setHelp] = useState(false);
  const data = rider.data;
  const company = data?.rider.partnerName ?? "";
  const language = RIDER_LANGS.find((item) => item.code === lang)?.label ?? "English";

  function leave() {
    Alert.alert(t.removeTitle, t.removeBody, [
      { text: t.keep, style: "cancel" },
      { text: t.remove, style: "destructive", onPress: () => { forgetRiderToken(); router.replace("/welcome"); } },
    ]);
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
          <Row lead={<Tile icon="truck" />} title={say("me.bike")} sub={data.rider.plate || say("me.noPlate", { company })} />
        </List>
      ) : null}
      <List>
        {data?.rider.partnerPhone ? <Row lead={<Tile icon="phone" />} title={t.callCompany({ name: company })} onPress={() => void Linking.openURL(`tel:${data.rider.partnerPhone}`)} /> : null}
        <Row lead={<Tile icon="help" />} title={say("me.help")} onPress={() => setHelp(true)} />
        <Row lead={<Tile icon="logout" />} title={t.removeLink} titleStyle={{ color: colors.danger }} onPress={leave} />
      </List>
      <HelpSheet visible={help} onClose={() => setHelp(false)} />
    </TabScreen>
  );
}
