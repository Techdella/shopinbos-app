import type { ReactNode } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { router, type Tabs } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { signOut } from "@/lib/auth";
import type { Tone } from "@/lib/partner-pure";
import { colors, radii } from "@/theme";

// Pieces shared by the supplier, delivery partner and rider screens, following the "Shopinbos Partners · mobile"
// and "Shopinbos Riders app" prototypes: labelled pill tab bar, partner header, stat tiles, tone pills.

export const TONES: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: colors.peach, fg: colors.accentInk },
  success: { bg: colors.successTint, fg: colors.success },
  warning: { bg: "#FDF0D5", fg: "#8A5A00" },
  muted: { bg: colors.canvas, fg: colors.inkSoft },
  danger: { bg: colors.dangerTint, fg: colors.danger },
  info: { bg: "#E7EEFC", fg: "#2449A8" },
};

export function TonePill({ tone, label, style }: { tone: Tone; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: TONES[tone].bg, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }, style]}>
      <T weight="bold" style={{ fontSize: 12, color: TONES[tone].fg }}>{label}</T>
    </View>
  );
}

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** The prototype's floating white bar: icon + label per tab, the active one in an ink circle. */
export function PartnerTabBar({ state, navigation, descriptors, items }: TabBarProps & { items: Record<string, { icon: AppIconName; label: string; badge?: number }> }) {
  const insets = useSafeAreaInsets();
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if ((StyleSheet.flatten(focusedOptions?.tabBarStyle) as { display?: string } | undefined)?.display === "none") return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(insets.bottom, 12) }}>
      <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: 999, padding: 6, shadowColor: colors.ink, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        {state.routes.map((route, index) => {
          const meta = items[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={meta.badge ? `${meta.label}, ${meta.badge} new` : meta.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: focused ? colors.ink : "transparent" }}
            >
              <AppIcon name={meta.icon} size={20} color={focused ? "#FFFFFF" : colors.ink} />
              <T weight="bold" numberOfLines={1} style={{ fontSize: 10.5, color: focused ? "#FFFFFF" : colors.ink }}>{meta.label}</T>
              {meta.badge ? (
                <View style={{ position: "absolute", top: 5, right: "22%", minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                  <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 10 }}>{meta.badge > 9 ? "9+" : String(meta.badge)}</T>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A tab's scrolling body with pull to refresh and room for the floating tab bar (for tabs with their own header). */
export function PartnerScroll({ children, refreshing = false, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 124, gap: 14 }} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Square logo (or initials) + "Shopinbos Partners" eyebrow + business name, as in the prototype header. */
export function PartnerHeader({ eyebrow, name, logoUrl, right }: { eyebrow: string; name: string; logoUrl?: string | null; right?: ReactNode }) {
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "S";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={{ width: 46, height: 46, borderRadius: 14 }} contentFit="cover" accessibilityLabel={`${name} logo`} />
      ) : (
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 15 }}>{initials}</T>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T style={{ color: colors.inkSoft, fontSize: 13 }}>{eyebrow}</T>
        <T weight="extrabold" style={{ fontSize: 18 }} numberOfLines={1} accessibilityRole="header">{name}</T>
      </View>
      {right}
    </View>
  );
}

/** Small white number tile ("New 3", "Active 3", "Issues 1"). */
export function StatTile({ label, value, onPress, tone }: { label: string; value: string | number; onPress?: () => void; tone?: "danger" }) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}: ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 6, opacity: pressed ? 0.8 : 1 })}
    >
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</T>
      <T weight="extrabold" style={{ fontSize: 20, color: tone === "danger" && Number(value) > 0 ? colors.danger : colors.ink }}>{String(value)}</T>
    </Pressable>
  );
}

/** Product or parcel picture, or a soft placeholder box. */
export function Thumb({ uri, size = 48, icon = "box" }: { uri?: string | null; size?: number; icon?: AppIconName }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.canvas }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
      <AppIcon name={icon} size={size * 0.42} color={colors.inkSoft} />
    </View>
  );
}

/** "Yaba → Lekki Phase 1" with bold place names. */
export function RouteLine({ from, to, size = 15 }: { from: string; to: string; size?: number }) {
  return (
    <T style={{ fontSize: size }} numberOfLines={2} accessibilityLabel={`${from} to ${to}`}>
      <T weight="extrabold" style={{ fontSize: size }}>{from}</T>
      <T style={{ fontSize: size, color: colors.inkSoft }}>{"  →  "}</T>
      <T weight="extrabold" style={{ fontSize: size }}>{to}</T>
    </T>
  );
}

/** Label + value row inside a Card. */
export function KeyValue({ label, value, first }: { label: string; value: ReactNode; first?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <T style={{ color: colors.inkSoft }}>{label}</T>
      {typeof value === "string" || typeof value === "number" ? <T weight="bold" style={{ flexShrink: 1, textAlign: "right" }} selectable>{String(value)}</T> : value}
    </View>
  );
}

/** A bottom sheet with a title and a list of choices (pick a rider, pick a reason…). */
export function ChoiceSheet<V extends string>({
  visible,
  title,
  options,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Array<{ value: V; label: string; hint?: string }>;
  onPick: (value: V) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: 22, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
          <T weight="extrabold" style={{ fontSize: 18, marginBottom: 6 }} accessibilityRole="header">{title}</T>
          <ScrollView style={{ maxHeight: 440 }}>
            {options.map((option, index) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => onPick(option.value)}
                style={({ pressed }) => ({ paddingVertical: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
              >
                <T weight="bold" style={{ fontSize: 16 }}>{option.label}</T>
                {option.hint ? <T style={{ color: colors.inkSoft, fontSize: 13, marginTop: 2 }}>{option.hint}</T> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Log out: signOut() asks first (lib/auth.ts); after a real sign-out, back to the welcome screen. */
export function confirmSignOut(extra?: () => void) {
  void signOut().then(() => {
    extra?.();
    router.replace("/welcome");
  });
}
