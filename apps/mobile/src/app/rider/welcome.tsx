import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eyebrow, Sub, Title } from "@/components/design";
import { Center, RiderBadge } from "@/components/RiderKit";
import { PillButton, WithTip } from "@/components/ui";
import { firstName, initials } from "@/lib/rider-pure";
import { useRiderStrings } from "@/lib/rider-strings";
import { colors } from "@/theme";

// Riders app, first run (E2E-Rider "rWelcome"): "{Company} added you as a rider." Continue → Which language?
// Today opens this once per rider on this phone (lib/rider.ts riderWelcomed); the language screen marks it done.

export default function RiderWelcome() {
  const params = useLocalSearchParams<{ id?: string; name?: string; company?: string; lang?: string }>();
  const { say } = useRiderStrings();
  const company = String(params.company ?? "");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 }}>
        <Center top={30}>
          <RiderBadge label={initials(company)} size={96} />
          <Eyebrow>{say("welcome.hi", { name: firstName(params.name) ?? "" })}</Eyebrow>
          <Title style={{ textAlign: "center" }}>{say("welcome.title", { company })}</Title>
          <WithTip title={say("welcome.title", { company })} tip={{ text: say("welcome.sub") }} style={{ justifyContent: "center" }}>
            <Sub style={{ textAlign: "center" }}>{say("welcome.subShort")}</Sub>
          </WithTip>
        </Center>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10 }}>
        <PillButton tone="forest" title={say("continue")} onPress={() => router.push({ pathname: "/rider/language", params: { id: params.id ?? "", first: "1", lang: params.lang ?? "" } })} />
      </View>
    </SafeAreaView>
  );
}
