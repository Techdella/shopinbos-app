import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, Mascot, PillButton, T, Wash, Wordmark } from "@/components/ui";
import { colors } from "@/theme";

export default function Welcome() {
  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 22, paddingBottom: 12 }}>
        <View style={{ paddingTop: 10 }}>
          <Wordmark />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Mascot name="rex" size={260} label="Rex, the Shopinbos store builder" />
          <View style={{ position: "absolute", top: 40, right: 0, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 4, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 3 }}>
            <T weight="bold">Hi, I&apos;m Rex. I build shops.</T>
          </View>
        </View>
        <T weight="extrabold" style={{ fontSize: 38, lineHeight: 39, letterSpacing: -1 }} accessibilityRole="header">
          Your shop, live in 10 minutes
        </T>
        <T style={{ color: colors.inkSoft, marginTop: 10, marginBottom: 22, lineHeight: 21 }}>
          Tell Rex what you sell. Sell on your own link, WhatsApp and Instagram. Free to start.
        </T>
        <PillButton title="Start with my phone number" onPress={() => router.push({ pathname: "/signup", params: { method: "phone" } })} />
        <PillButton title="Use email instead" tone="white" size="md" style={{ marginTop: 10 }} onPress={() => router.push({ pathname: "/signup", params: { method: "email" } })} />
        <LinkButton title="I already have a shop" style={{ marginTop: 6 }} onPress={() => router.push("/login")} />
      </SafeAreaView>
    </View>
  );
}
