import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { T } from "@/components/ui";
import { colors } from "@/theme";

/** Shared frame for the list tabs: big title, optional action, pull to refresh, room for the tab bar. */
export function TabScreen({ title, action, children, refreshing = false, onRefresh }: { title: string; action?: ReactNode; children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, minHeight: 46 }}>
          <T weight="extrabold" style={{ fontSize: 30, letterSpacing: -0.6 }} accessibilityRole="header">{title}</T>
          {action}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
