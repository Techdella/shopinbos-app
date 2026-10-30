import { useEffect, type ReactNode } from "react";
import { BackHandler, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, currentScheme, fonts, radii } from "@/theme";

// The store editor's pieces (design SE-02…SE-16): the bottom sheets that leave the shop visible above them, the
// chips, the toolbars, the Undo toast and the coach marks. Colours are the app's own tokens (#16141F ink, #FF6A2B
// orange, #F0EEF5 chips), so the editor follows dark mode too.

/** The grey behind the shop on the canvas (#E9E7EE in the design). */
export const canvasBackground = () => (currentScheme() === "dark" ? colors.canvas : "#E9E7EE");
/** The light orange behind a picked tool (#FFE3D6). */
const PICKED = () => (currentScheme() === "dark" ? colors.peach : "#FFE3D6");
/** "Undo" in a toast (#FFB18F on the ink pill). */
const TOAST_ACTION = "#FFB18F";

/**
 * A bottom sheet over the editor: white, rounded top, a grab handle, the title and Done (or a note) on the right.
 * Not a modal: the shop above stays in view and changes as the seller taps (Theme, Products, Sections). `dim` darkens
 * the shop behind (Add a section, Publish, Pages). Android's back button closes it.
 */
export function EditorSheet({
  title,
  onClose,
  right,
  dim = false,
  height,
  children,
  scroll = true,
  testID,
}: {
  title: string;
  onClose: () => void;
  right?: ReactNode;
  dim?: boolean;
  height?: number | `${number}%`;
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const t = useT("storeEditor");
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
  const body = <View style={{ gap: 12, paddingBottom: Math.max(insets.bottom, 12) + 14 }}>{children}</View>;
  return (
    <>
      {dim ? <Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(22,20,31,0.35)", zIndex: 24 }} /> : null}
      <View
        testID={testID}
        accessibilityViewIsModal={dim}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 25,
          maxHeight: "86%",
          ...(height ? { height } : {}),
          backgroundColor: colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 10,
          paddingHorizontal: 18,
          boxShadow: "0px -20px 40px -20px rgba(0,0,0,0.35)",
        }}
      >
        <View style={{ width: 40, height: 5, borderRadius: 9, backgroundColor: colors.grab, alignSelf: "center", marginBottom: 12 }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, minHeight: 36 }}>
          <T weight="extrabold" accessibilityRole="header" numberOfLines={2} style={{ fontSize: 18, flexShrink: 1 }}>{title}</T>
          {right === undefined ? <DoneButton onPress={onClose} /> : right}
        </View>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
      </View>
    </>
  );
}

/** The sheet's dark "Done" pill. */
export function DoneButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const t = useT("storeEditor");
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.inkFill, justifyContent: "center", opacity: pressed ? 0.85 : 1 })}>
      <T weight="bold" style={{ fontSize: 14, color: "#FFFFFF" }}>{label ?? t("done")}</T>
    </Pressable>
  );
}

/** A small grey label over a group of choices in a sheet ("Colours", "Headline font"). */
export function SheetLabel({ children }: { children: ReactNode }) {
  return <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft }}>{children}</T>;
}

/** A chip (`.chip`): grey, ink when picked. */
export function Chip({ label, on, onPress, icon, style, fontFamily, testID }: { label: string; on: boolean; onPress: () => void; icon?: AppIconName; style?: StyleProp<ViewStyle>; fontFamily?: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [{ minHeight: 36, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: on ? colors.inkFill : colors.grayTint, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.85 : 1 }, style]}
    >
      {icon ? <AppIcon name={icon} size={15} color={on ? "#FFFFFF" : colors.ink} /> : null}
      <T weight="semibold" numberOfLines={1} style={[{ fontSize: 13.5, color: on ? "#FFFFFF" : colors.ink }, fontFamily ? { fontFamily } : null]}>{label}</T>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
      {children}
    </ScrollView>
  );
}

/** A round icon button on the editor's top bar (`.ib`): white, or plain (`ghost`). */
export function TopIcon({ icon, label, onPress, ghost, disabled, testID, dark }: { icon: AppIconName; label: string; onPress: () => void; ghost?: boolean; disabled?: boolean; testID?: string; dark?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ghost ? "transparent" : dark ? "rgba(255,255,255,0.12)" : colors.surface,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        ...(ghost || dark ? {} : { boxShadow: "0px 1px 2px rgba(22,20,31,0.06)" }),
      })}
    >
      <AppIcon name={icon} size={20} color={dark ? "#FFFFFF" : colors.ink} strokeWidth={2} />
    </Pressable>
  );
}

/** One tool on the bottom toolbar (`.bt button`): an icon in a soft square over its name. */
export function ToolButton({ icon, label, onPress, on, primary, testID }: { icon: AppIconName; label: string; onPress: () => void; on?: boolean; primary?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(on) }} onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 5, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 42, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: primary ? colors.accent : on ? PICKED() : "transparent" }}>
        <AppIcon name={icon} size={22} color={primary ? colors.onAccent : colors.ink} strokeWidth={2} />
      </View>
      <T weight="semibold" numberOfLines={1} style={{ fontSize: 11, color: on ? colors.ink : colors.inkSoft }}>{label}</T>
    </Pressable>
  );
}

/** The floating dark toolbar's buttons (`.ftb button`). */
export function FloatButton({ icon, label, onPress, on, disabled, danger, testID }: { icon: AppIconName; label: string; onPress: () => void; on?: boolean; disabled?: boolean; danger?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ minWidth: 50, paddingVertical: 6, paddingHorizontal: 7, borderRadius: 10, alignItems: "center", gap: 3, backgroundColor: on || pressed ? "rgba(255,255,255,0.14)" : "transparent", opacity: disabled ? 0.35 : 1 })}
    >
      <AppIcon name={icon} size={18} color={danger ? "#FF9C87" : "#FFFFFF"} strokeWidth={2} />
      <T weight="semibold" numberOfLines={1} style={{ fontSize: 10.5, color: "#FFFFFF" }}>{label}</T>
    </Pressable>
  );
}

/** The dark pill toast (`.toast`), with an action ("Undo") in light orange. */
export function Toast({ text, action, onAction, bottom }: { text: string; action?: string; onAction?: () => void; bottom: number }) {
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom, alignItems: "center", zIndex: 28 }}>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ maxWidth: "100%", backgroundColor: colors.inkFill, borderRadius: radii.pill, paddingVertical: 8, paddingLeft: 16, paddingRight: action ? 8 : 16, flexDirection: "row", alignItems: "center", gap: 12, boxShadow: "0px 16px 30px -12px rgba(0,0,0,0.5)" }}>
        <T weight="semibold" numberOfLines={2} style={{ fontSize: 13.5, color: "#FFFFFF", flexShrink: 1 }}>{text}</T>
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={{ borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.1)" }}>
            <T weight="extrabold" style={{ fontSize: 13.5, color: TOAST_ACTION }}>{action}</T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** A coach mark (`.coach`): a dark card with a bold first line, or the orange one-liner pointing at the toolbar. */
export function Coach({ title, body, step, action, onAction, tone = "ink", style }: { title?: string; body: string; step?: string; action?: string; onAction?: () => void; tone?: "ink" | "accent"; style?: StyleProp<ViewStyle> }) {
  const ink = tone === "ink";
  return (
    <View style={[{ position: "absolute", zIndex: 26, borderRadius: 18, paddingVertical: ink ? 14 : 10, paddingHorizontal: ink ? 16 : 14, backgroundColor: ink ? colors.inkFill : colors.accent, boxShadow: "0px 20px 40px -14px rgba(0,0,0,0.5)" }, style]}>
      {title ? <T weight="extrabold" style={{ fontSize: 15, color: "#FFFFFF", marginBottom: 2 }}>{title}</T> : null}
      <T weight={ink ? "regular" : "semibold"} style={{ fontSize: ink ? 13.5 : 12.5, lineHeight: ink ? 19.5 : 17, color: ink ? "#FFFFFF" : colors.onAccent }}>{body}</T>
      {action && onAction ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <T style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{step ?? ""}</T>
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={{ backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
            <T weight="extrabold" style={{ fontSize: 13, color: colors.onAccent }}>{action}</T>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** A round colour swatch made of stripes (`.sw`), ringed when picked. */
export function Swatch({ colours, on, size = 46 }: { colours: readonly string[]; on: boolean; size?: number }) {
  return (
    <View style={{ width: size + 9, height: size + 9, borderRadius: (size + 9) / 2, borderWidth: on ? 2 : 0, borderColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", flexDirection: "row", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }}>
        {colours.map((colour, index) => <View key={`${colour}-${index}`} style={{ flex: 1, backgroundColor: colour }} />)}
      </View>
    </View>
  );
}

/** The big title on the editor's own full screens (Bricolage, SE-14). */
export function BigTitle({ children }: { children: ReactNode }) {
  return <T accessibilityRole="header" style={{ fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 31, letterSpacing: -0.7, textAlign: "center" }}>{children}</T>;
}
