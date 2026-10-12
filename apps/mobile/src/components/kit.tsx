import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { colors, radii } from "@/theme";

// Small pieces the list and settings screens share: loading, empty and error states, rows, badges.

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 40, alignItems: "center", gap: 10 }} accessibilityLabel={label}>
      <ActivityIndicator color={colors.ink} />
      <T style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</T>
    </View>
  );
}

export function EmptyState({ icon = "sparkle", title, children, action }: { icon?: AppIconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={22} color={colors.inkSoft} />
      </View>
      <T weight="extrabold" style={{ fontSize: 16, textAlign: "center" }}>{title}</T>
      {children ? <T style={{ color: colors.inkSoft, textAlign: "center", lineHeight: 20 }}>{children}</T> : null}
      {action}
    </Card>
  );
}

/** An error with a retry button; shown in place of a list that couldn't load. */
export function ErrorState({ message, onRetry, web }: { message: string; onRetry?: () => void; web?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ gap: 10 }}>
      <Notice>{message}</Notice>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {onRetry ? <PillButton title="Try again" size="sm" tone="white" onPress={onRetry} /> : null}
        {web ? <PillButton title={web.label} size="sm" tone="white" onPress={web.onPress} /> : null}
      </View>
    </View>
  );
}

export function Badge({ label, bg = colors.canvas, fg = colors.ink }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}>
      <T weight="bold" style={{ fontSize: 11.5, color: fg }}>{label}</T>
    </View>
  );
}

/** A tappable row inside a Card list (icon, label, optional hint, chevron). */
export function LinkRow({ icon, label, hint, onPress, first, right }: { icon?: AppIconName; label: string; hint?: string; onPress: () => void; first?: boolean; right?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
    >
      {icon ? <AppIcon name={icon} size={20} /> : null}
      <View style={{ flex: 1 }}>
        <T weight="semibold" style={{ fontSize: 15 }}>{label}</T>
        {hint ? <T style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 2 }} numberOfLines={2}>{hint}</T> : null}
      </View>
      {right ?? <AppIcon name="chevron" size={18} color={colors.inkSoft} />}
    </Pressable>
  );
}

export function SectionTitle({ children, action, style }: { children: ReactNode; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }, style]}>
      <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{children}</T>
      {action}
    </View>
  );
}

/** Round initials avatar for people without a photo. */
export function Initials({ name, size = 44, bg = colors.peach, fg = colors.accentInk }: { name: string; size?: number; bg?: string; fg?: string }) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const letters = ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <T weight="extrabold" style={{ color: fg, fontSize: size * 0.36 }}>{letters}</T>
    </View>
  );
}

/** Horizontal scroll of filter chips is too fiddly on small phones; these wrap instead. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}
