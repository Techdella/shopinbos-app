import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { List, Title } from "@/components/design";
import { PillButton, T } from "@/components/ui";
import { useOnboarding } from "@/components/OnboardingContext";
import { API_URL } from "@/lib/api";
import { finishOnboarding, tickChecklist } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { HelpButton } from "@/components/Help";

export default function Checklist() {
  const t = useT("m_onboarding", "m_shop");
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 17, color: colors.accentInk }}>{initial}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 13 }}>{t("checklist.welcome")}</T>
            <T weight="extrabold" style={{ fontSize: 17 }}>{status.store.name}</T>
          </View>
          <HelpButton />
        </View>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
            <Title size={28} style={{ flex: 1 }}>{t("finish")}</Title>
            <T weight="bold" style={{ color: colors.inkSoft }}>{t("checklist.count", { done, total: status.checklist.length })}</T>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: "hidden" }}>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.accent, width: `${(done / status.checklist.length) * 100}%` }} />
          </View>
        </View>
        <List>
          {status.checklist.map((item) => (
            <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 68, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done, disabled: !item.manual }}
                accessibilityLabel={t.dynamic(`checklist.${item.key}.label`, item.label)}
                disabled={!item.manual}
                hitSlop={8}
                onPress={() => void tickChecklist(item.key, !item.done).then(setStatus).catch(() => null)}
                style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: item.done ? colors.success : colors.lineStrong, backgroundColor: item.done ? colors.success : colors.surface, alignItems: "center", justifyContent: "center" }}
              >
                {item.done && <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 14 }}>✓</T>}
              </Pressable>
              <Pressable accessibilityRole="button" style={{ flex: 1, minHeight: 44, justifyContent: "center" }} onPress={() => (item.key === "id" ? router.push("/wallet") : void WebBrowser.openBrowserAsync(`${API_URL}${item.href}`))}>
                <T weight="bold" style={{ fontSize: 16, textDecorationLine: item.done ? "line-through" : "none" }}>{t.dynamic(`checklist.${item.key}.label`, item.label)}</T>
                <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{t.dynamic(`checklist.${item.key}.hint`, item.hint)}</T>
              </Pressable>
            </View>
          ))}
        </List>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: colors.canvas }}>
        <PillButton title={t("live.goToShop")} busy={busy} onPress={() => void finish()} />
      </View>
    </SafeAreaView>
  );
}
