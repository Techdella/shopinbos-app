import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Chip, LinkButton, Mascot, PillButton, T, Wash, Wordmark } from "@/components/ui";
import { SIGNUP_ROLES, type SignupRole } from "@/lib/partner-pure";
import { colors, radii } from "@/theme";
import { HelpButton } from "@/components/Help";

// First screen: pick what you do (like the web sign-up's "I sell / I supply shops / I deliver"), then sign up
// with a phone number or email, or log in. Riders open the private link their dispatcher sent.

const NEXT: Record<Exclude<SignupRole, "seller">, { icon: "box" | "truck"; lines: string[] }> = {
  supplier: { icon: "box", lines: ["List your stock once, with photos and prices", "Shops sell it under their brand, or order wholesale", "Pack with their label, hand it to the rider", "Paid to your bank after delivery"] },
  logistics_partner: { icon: "truck", lines: ["Set where you deliver and your prices", "Accept jobs and assign your riders", "Proof of delivery with the buyer's code", "Paid weekly to your company account"] },
};

export default function Welcome() {
  const [role, setRole] = useState<SignupRole>("seller");
  const copy = SIGNUP_ROLES.find((item) => item.role === role) ?? SIGNUP_ROLES[0];

  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 22, paddingBottom: 12 }}>
        <View style={{ paddingTop: 10, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark />
            <HelpButton />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="What do you do?">
            {SIGNUP_ROLES.map((item) => <Chip key={item.role} label={item.tab} on={role === item.role} onPress={() => setRole(item.role)} />)}
          </View>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {role === "seller" ? (
            <>
              <Mascot name="rex" size={240} label="Rex, the Shopinbos store builder" />
              <View style={{ position: "absolute", top: 30, right: 0, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 4, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 3 }}>
                <T weight="bold">Hi, I&apos;m Rex. I build shops.</T>
              </View>
            </>
          ) : (
            <View style={{ alignSelf: "stretch", backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 12, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name={NEXT[role].icon} color={colors.accentInk} size={24} />
              </View>
              {NEXT[role].lines.map((line, index) => (
                <View key={line} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
                    <T weight="extrabold" style={{ fontSize: 13.5, color: colors.forest }}>{index + 1}</T>
                  </View>
                  <T weight="semibold" style={{ flex: 1, fontSize: 14.5 }}>{line}</T>
                </View>
              ))}
            </View>
          )}
        </View>
        <T weight="extrabold" style={{ fontSize: 34, lineHeight: 36, letterSpacing: -1 }} accessibilityRole="header">
          {copy.title}
        </T>
        <T style={{ color: colors.inkSoft, marginTop: 10, marginBottom: 20, lineHeight: 21 }}>{copy.sub}</T>
        <PillButton title="Start with my phone number" onPress={() => router.push({ pathname: "/signup", params: { method: "phone", role } })} />
        <PillButton title="Use email instead" tone="white" size="md" style={{ marginTop: 10 }} onPress={() => router.push({ pathname: "/signup", params: { method: "email", role } })} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18 }}>
          <LinkButton title={role === "seller" ? "I already have a shop" : "I already have an account"} style={{ marginTop: 6 }} onPress={() => router.push("/login")} />
          {role === "logistics_partner" ? <LinkButton title="I'm a rider" color={colors.inkSoft} style={{ marginTop: 6 }} onPress={() => router.push("/rider/link")} /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
