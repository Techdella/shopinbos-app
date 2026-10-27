import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { initialsOf } from "@shared/identity-images";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Small pieces the list and settings screens share: loading, empty and error states, rows, badges.

export function LoadingBlock({ label: given }: { label?: string }) {
  const t = useT("common");
  const label = given ?? t("loading");
  return (
    <View style={{ paddingVertical: 40, alignItems: "center", gap: 10 }} accessibilityLabel={label}>
      <ActivityIndicator color={colors.ink} />
      <T style={{ color: colors.inkSoft, fontSize: 15 }}>{label}</T>
    </View>
  );
}

export function EmptyState({ icon = "sparkle", title, children, action }: { icon?: AppIconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={22} color={colors.inkSoft} />
      </View>
      <T weight="extrabold" style={{ fontSize: 17, textAlign: "center" }}>{title}</T>
      {children ? <T style={{ color: colors.inkSoft, textAlign: "center", fontSize: 15, lineHeight: 22 }}>{children}</T> : null}
      {action}
    </Card>
  );
}

/** An error with a retry button; shown in place of a list that couldn't load. */
export function ErrorState({ message, onRetry, web }: { message: string; onRetry?: () => void; web?: { label: string; onPress: () => void } }) {
  const t = useT("m_ui", "common");
  return (
    <View style={{ gap: 10 }}>
      <Notice>{message}</Notice>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {onRetry ? <PillButton title={t("tryAgain")} size="sm" tone="white" onPress={onRetry} /> : null}
        {web ? <PillButton title={web.label === "Open on web" ? t("openInBrowser") : web.label} size="sm" tone="white" onPress={web.onPress} /> : null}
      </View>
    </View>
  );
}

export function Badge({ label, bg = colors.canvas, fg = colors.ink }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", maxWidth: "100%" }}>
      <T weight="bold" numberOfLines={1} style={{ fontSize: 13, color: fg }}>{label}</T>
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
        <T weight="semibold" style={{ fontSize: 16 }}>{label}</T>
        {hint ? <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2 }} numberOfLines={2}>{hint}</T> : null}
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
export function Initials({ name, size = 44, bg = colors.peach, fg = colors.accentInk, radius }: { name: string; size?: number; bg?: string; fg?: string; radius?: number }) {
  // One rule for every avatar (shared/identity-images): "Ada's Closet" is "AC", not "AS".
  const letters = initialsOf(name);
  return (
    <View style={{ width: size, height: size, borderRadius: radius ?? size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <T weight="extrabold" style={{ color: fg, fontSize: size * 0.36 }}>{letters}</T>
    </View>
  );
}

/**
 * A person's photo (round) or a shop logo (rounded square), with their initials when there's no picture or it
 * doesn't load. The same pictures as the web's top bar and menu (GET /api/app/me/images).
 */
export function Picture({ uri, name, size = 44, shape = "round" }: { uri: string | null | undefined; name: string; size?: number; shape?: "round" | "square" }) {
  const [broken, setBroken] = useState<string | null>(null);
  const radius = shape === "round" ? size / 2 : Math.round(size * 0.28);
  if (!uri || broken === uri) return <Initials name={name} size={size} radius={radius} />;
  return (
    <Image
      source={{ uri }}
      onError={() => setBroken(uri)}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.canvas }}
      contentFit={shape === "round" ? "cover" : "contain"}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Horizontal scroll of filter chips is too fiddly on small phones; these wrap instead. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}
