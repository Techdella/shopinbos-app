import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { colors } from "@/theme";

// A bottom sheet (the "+" sheet and Help), from the "Simple app" prototype: white, rounded top, a grab handle,
// one question as the title and big choices.

export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(22,20,31,0.38)" }} />
        <View testID={testID} accessibilityViewIsModal style={{ backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 16, gap: 10 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.track, alignSelf: "center", marginBottom: 6 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <T weight="extrabold" style={{ flex: 1, fontSize: 22, lineHeight: 28 }} accessibilityRole="header">{title}</T>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppIcon name="x" size={16} />
              <T weight="bold" style={{ fontSize: 15 }}>Close</T>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** One big choice: tinted icon, a short title and one line saying what happens. */
export function ChoiceRow({ icon, title, sub, onPress, tint = colors.canvas, iconColor = colors.ink, testID }: { icon: AppIconName; title: string; sub?: string; onPress: () => void; tint?: string; iconColor?: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 17 }}>{title}</T>
        {sub ? <T style={{ fontSize: 15, lineHeight: 21, color: colors.inkSoft, marginTop: 2 }}>{sub}</T> : null}
      </View>
      <AppIcon name="chevron" size={18} color={colors.inkSoft} />
    </Pressable>
  );
}
