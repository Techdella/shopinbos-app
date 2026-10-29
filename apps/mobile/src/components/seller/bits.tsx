import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Eyebrow } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Initials } from "@/components/kit";
import { T } from "@/components/ui";
import { colors, themed } from "@/theme";

// Small seller-side pieces of the 2026 "Seller app" prototype that the shared design kit doesn't have: the round
// white icon button (`.iconb`), a partner's logo or initials, a product thumbnail (`.thumb`) and a section
// (eyebrow + card) wrapper.

/** A round 44px white button with one icon (`.iconb`). */
export function IconButton({ icon, label, onPress, testID }: { icon: AppIconName; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
    >
      <AppIcon name={icon} size={20} />
    </Pressable>
  );
}

const MARKS = themed(() => ([
  { bg: colors.mintTint, fg: colors.forest },
  { bg: colors.peach, fg: colors.accentInk },
  { bg: colors.blueTint, fg: colors.blueInk },
  { bg: colors.successTint, fg: colors.success },
  { bg: "#FCE4EC", fg: "#A0204F" },
]));

/** The same tint for the same name every time. */
function markFor(name: string) {
  let sum = 0;
  for (const char of name) sum = (sum + char.charCodeAt(0)) % 997;
  return MARKS[sum % MARKS.length];
}

/** A delivery partner's logo, else their initials on a tint (`.ini`). */
export function PartnerMark({ name, logoUrl, size = 44 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) return <Image source={{ uri: logoUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" accessibilityIgnoresInvertColors />;
  const mark = markFor(name);
  return <Initials name={name} size={size} bg={mark.bg} fg={mark.fg} />;
}

/** A product picture (`.thumb`, 52px, radius 14), or a plain tile when there's none. */
export function Thumb({ uri, size = 52, radius = 14, fallback }: { uri?: string | null; size?: number; radius?: number; fallback?: string }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}>
      {fallback ? <T weight="extrabold" style={{ fontSize: size / 3 }}>{fallback.charAt(0).toUpperCase()}</T> : <AppIcon name="box" size={size / 2.4} color={colors.inkSoft} />}
    </View>
  );
}

/** An eyebrow over its card, 10px apart (the prototype's grouped sections). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

/** Chips that wrap (`.chips`). */
export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>;
}
