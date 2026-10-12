import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { PillButton, T } from "@/components/ui";
import { useOnboarding } from "@/components/OnboardingContext";
import { API_URL } from "@/lib/api";
import { finishOnboarding, tickChecklist } from "@/lib/onboarding";
import { colors, radii } from "@/theme";

export default function Checklist() {
  const { status, setStatus } = useOnboarding();
  const [busy, setBusy] = useState(false);
  if (!status) return null;
  const done = status.checklist.filter((item) => item.done).length;
  const initial = (status.ownerName.trim()[0] ?? "S").toUpperCase();

  async function finish() {
    setBusy(true);
    await finishOnboarding(status!.store.live).catch(() => null);
    router.replace("/home");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 18, color: colors.accentInk }}>{initial}</T>
          </View>
          <View>
            <T style={{ color: colors.inkSoft }}>Welcome to your shop</T>
            <T weight="extrabold" style={{ fontSize: 17 }}>{status.store.name}</T>
          </View>
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T weight="extrabold" style={{ fontSize: 18 }} accessibilityRole="header">Finish setting up</T>
            <T weight="bold">{done} of {status.checklist.length}</T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.lilac, marginTop: 12, overflow: "hidden" }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.accent, width: `${(done / status.checklist.length) * 100}%` }} />
          </View>
          {status.checklist.map((item, index) => (
            <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, marginTop: index ? 0 : 8 }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done, disabled: !item.manual }}
                accessibilityLabel={item.label}
                disabled={!item.manual}
                onPress={() => void tickChecklist(item.key, !item.done).then(setStatus).catch(() => null)}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: item.done ? colors.success : colors.toggleOff, backgroundColor: item.done ? colors.success : colors.surface, alignItems: "center", justifyContent: "center" }}
              >
                {item.done && <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 13 }}>✓</T>}
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}${item.href}`)}>
                <T weight="bold" style={{ fontSize: 15, textDecorationLine: item.done ? "line-through" : "none" }}>{item.label}</T>
                <T style={{ color: colors.inkSoft, fontSize: 13 }}>{item.hint}</T>
              </Pressable>
            </View>
          ))}
        </View>
        <PillButton title="Go to my shop" busy={busy} style={{ marginTop: 16, borderRadius: radii.pill }} onPress={() => void finish()} />
      </ScrollView>
    </SafeAreaView>
  );
}
