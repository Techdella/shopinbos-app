import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T, Toggle } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { PaletteDef } from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";

// Small pieces of the guided build's screens (design RB-03…RB-16).

/** The black round tick on a picked card. */
export function CheckBadge({ size = 30, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.inkFill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" }, style]}>
      <AppIcon name="check" size={size * 0.5} color="#FFFFFF" strokeWidth={2.8} />
    </View>
  );
}

/** "✨ Rex pick": the mint tag on Rex's recommendation. */
export function RexPick({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const t = useT("m_rexBuild");
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, backgroundColor: colors.mintTint, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }, style]}>
      <AppIcon name="sparkle" size={13} color={colors.forest} />
      <T weight="bold" style={{ fontSize: 13, color: colors.forest }}>{label ?? t("style.rexPick")}</T>
    </View>
  );
}

/** A big tappable card that shows it's picked with a thick ink border and a tick. */
export function ChoiceCard({ on, onPress, children, label, style, testID, badge = true }: { on: boolean; onPress: () => void; children: ReactNode; label: string; style?: StyleProp<ViewStyle>; testID?: string; badge?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [{ ...surfaceCard(22), borderWidth: on ? 3 : 1, borderColor: on ? colors.ink : colors.line, padding: on ? 12 : 14, opacity: pressed ? 0.92 : 1 }, style]}
    >
      {children}
      {on && badge ? <CheckBadge style={{ position: "absolute", top: 10, right: 10 }} /> : null}
    </Pressable>
  );
}

/** A row with an icon tile, a title and hint, and a switch (extra sections, show prices, pay on delivery). */
export function SwitchRow({ icon, title, sub, on, onChange, tag, testID }: { icon?: AppIconName | "naira"; title: string; sub?: string; on: boolean; onChange: (on: boolean) => void; tag?: string; testID?: string }) {
  return (
    <View testID={testID} style={{ ...surfaceCard(22), flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
      {icon ? (
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}>
          {icon === "naira" ? <T weight="extrabold" style={{ fontSize: 18 }}>₦</T> : <AppIcon name={icon} size={22} color={colors.ink} />}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 16.5 }}>{title}</T>
        {sub ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{sub}</T> : null}
      </View>
      {tag ? (
        <View style={{ backgroundColor: colors.mintTint, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
          <T weight="bold" style={{ fontSize: 12.5, color: colors.forest }}>{tag}</T>
        </View>
      ) : null}
      <Toggle on={on} onChange={onChange} label={title} />
    </View>
  );
}

/** A product photo square with its name under it; a green tick when it's in, "Rex is writing…" while it's being made. */
export function ProductTile({ image, name, ok, tag, note, width, onPress }: { image: string | null; name: string; ok: boolean; tag?: string | null; note?: string | null; width: number; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={name} onPress={onPress} disabled={!onPress} style={{ width, gap: 6 }}>
      <View style={{ width, height: width * 0.84, borderRadius: 18, overflow: "hidden", backgroundColor: colors.grayTint }}>
        {image ? <Image source={{ uri: image }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
        {ok ? (
          <View style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.successFill, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={14} color="#FFFFFF" strokeWidth={2.8} />
          </View>
        ) : null}
        {tag ? (
          <View style={{ position: "absolute", left: 6, bottom: 6, right: 6, backgroundColor: "rgba(22,20,31,0.72)", borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
            <T weight="bold" numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 11 }}>{tag}</T>
          </View>
        ) : null}
      </View>
      <T weight="semibold" numberOfLines={1} style={{ fontSize: 14 }}>{name}</T>
      {note ? <T weight="bold" numberOfLines={1} style={{ fontSize: 12.5, color: colors.accentInk, marginTop: -4 }}>{note}</T> : null}
    </Pressable>
  );
}

/** The dashed "Add more" square. */
export function AddTile({ width, label, onPress }: { width: number; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width, height: width * 0.84, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", gap: 6 }}>
      <AppIcon name="camera" size={24} color={colors.inkSoft} />
      <T weight="semibold" style={{ fontSize: 14, color: colors.inkSoft }}>{label}</T>
    </Pressable>
  );
}

/** A round outline button with an icon (Camera, Gallery, Find stock). */
export function SourceButton({ icon, label, onPress, testID }: { icon: AppIconName; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}>
      <AppIcon name={icon} size={18} color={colors.ink} />
      <T weight="bold" style={{ fontSize: 15 }}>{label}</T>
    </Pressable>
  );
}

/**
 * The shop's banner as customers will see it, drawn on the phone (the style cards, the colour preview, the banner
 * photo and words): the shop name bar, the photo with the headline, the button and the colour dots.
 */
export function ShopBanner({ name, photo, headline, sub, cta, palette, height = 150, serif = false, dots = false, label }: {
  name: string;
  photo: string | null;
  headline: string;
  sub?: string;
  cta?: string;
  palette: PaletteDef;
  height?: number;
  serif?: boolean;
  dots?: boolean;
  label?: string;
}) {
  const tokens = palette.tokens;
  const paper = tokens.paperBg ?? "#FFFFFF";
  const ink = tokens.ink ?? colors.ink;
  return (
    <View accessible accessibilityLabel={label ?? `${name}. ${headline}`} style={{ borderRadius: 16, overflow: "hidden", backgroundColor: paper, borderWidth: 1, borderColor: tokens.border ?? colors.line }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <T weight="extrabold" numberOfLines={1} style={{ fontSize: 13, color: ink }}>{name}</T>
      </View>
      <View style={{ marginHorizontal: 8, height, borderRadius: 12, overflow: "hidden", backgroundColor: tokens.heroBg ?? colors.grayTint }}>
        {photo ? <Image source={{ uri: photo }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" /> : null}
        {photo ? <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" }} /> : null}
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 10, gap: 4 }}>
          <T numberOfLines={2} style={{ color: photo ? "#FFFFFF" : tokens.heroText ?? ink, fontSize: height > 160 ? 24 : 17, lineHeight: height > 160 ? 28 : 20, fontFamily: serif ? "serif" : fonts.extrabold, fontStyle: serif ? "italic" : "normal" }}>{headline}</T>
          {sub ? <T numberOfLines={2} style={{ color: photo ? "rgba(255,255,255,0.92)" : tokens.muted ?? ink, fontSize: 12 }}>{sub}</T> : null}
          {cta ? (
            <View style={{ alignSelf: "flex-start", marginTop: 4, backgroundColor: tokens.ctaBg ?? colors.inkFill, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <T weight="bold" style={{ color: tokens.ctaText ?? "#FFFFFF", fontSize: 12 }}>{cta}</T>
            </View>
          ) : null}
        </View>
      </View>
      {dots ? (
        <View style={{ flexDirection: "row", gap: 6, padding: 8 }}>
          <View style={{ flex: 1, height: 26, borderRadius: 8, backgroundColor: tokens.cardBg ?? colors.grayTint }} />
          <View style={{ flex: 1, height: 26, borderRadius: 8, backgroundColor: tokens.cardBg ?? colors.grayTint }} />
          <View style={{ width: 52, height: 18, alignSelf: "center", borderRadius: 9, backgroundColor: tokens.accent ?? colors.accent }} />
        </View>
      ) : (
        <View style={{ height: 8 }} />
      )}
    </View>
  );
}

/** Four colour blocks of a palette (D2b). */
export function Swatches({ palette, width = 110 }: { palette: PaletteDef; width?: number }) {
  return (
    <View style={{ width, height: 44, flexDirection: "row", borderRadius: 12, overflow: "hidden" }}>
      {palette.swatch.map((colour, index) => (
        <View key={index} style={{ flex: 1, backgroundColor: colour }} />
      ))}
    </View>
  );
}
