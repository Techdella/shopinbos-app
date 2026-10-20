import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Title } from "@/components/design";
import { HelpButton } from "@/components/Help";
import { colors } from "@/theme";

/** Frame for a tab root ("Simple app, end to end" prototype `.scr`): a big Bricolage title (or a custom header row),
 * Help or another action, pull to refresh, 20px gaps and room for the tab bar. */
export function TabScreen({ title, header, action, children, refreshing = false, onRefresh }: { title?: string; header?: ReactNode; action?: ReactNode; children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140, gap: 20 }} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
        {header ?? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 46 }}>
            <Title style={{ flex: 1 }}>{title}</Title>
            {action ?? <HelpButton />}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
