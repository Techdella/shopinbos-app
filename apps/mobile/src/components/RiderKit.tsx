import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppIcon, type AppIconName } from "@/components/icons";
import { T } from "@/components/ui";
import { colors, fonts } from "@/theme";

// Pieces only the Riders app uses ("Simple app, end to end" prototype, E2E-Rider): the round initials badge, the
// map box above a pickup or drop-off, the green tick on "Delivered", a big centred icon tile and the underlined link.

export const mapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Initials in a mint circle (`.ini`): the rider, or their company on the welcome screen. */
export function RiderBadge({ label, size = 44 }: { label: string; size?: number }) {
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
      <T weight="extrabold" style={{ fontSize: Math.round(size / 3), color: colors.forest }}>{label}</T>
    </View>
  );
}

/**
 * The map box (`.map`): a soft green panel with a pin, used where there's no real map (web, or an Android build
 * without a Google Maps key; see components/RiderMap). With an address, tapping it opens the phone's maps.
 * `children` sit on top (the online switch on Today).
 */
export function MapBox({ address, label, height = 150, children }: { address?: string | null; label: string; height?: number; children?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole={address ? "link" : undefined}
      accessibilityLabel={label}
      disabled={!address}
      onPress={() => { if (address) void Linking.openURL(mapUrl(address)); }}
      style={({ pressed }) => ({ height, borderRadius: 22, backgroundColor: "#E9EEE8", borderWidth: 1, borderColor: colors.line, overflow: "hidden", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}
    >
      {/* Two faint roads, so the panel reads as a map. */}
      <View style={{ position: "absolute", left: -20, right: -20, top: 64, height: 14, backgroundColor: "#FFFFFF", opacity: 0.7, transform: [{ rotate: "-8deg" }] }} />
      <View style={{ position: "absolute", top: -20, bottom: -20, left: "58%", width: 12, backgroundColor: "#FFFFFF", opacity: 0.7, transform: [{ rotate: "12deg" }] }} />
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.forestFill, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name="pin" size={22} color="#FFFFFF" />
      </View>
      {children}
    </Pressable>
  );
}

/** Where the map's overlay card sits: the bottom of the map, 12px in (`.map > .card` on Today). */
export const MAP_OVERLAY = { position: "absolute", left: 12, right: 12, bottom: 12 } as const;

/** The pins on the rider's map: orange pickup with a white ring, teal drop-off, and the rider's own teal dot with a halo. */
export function MapPin({ kind }: { kind: "pickup" | "drop" | "me" }) {
  if (kind === "me") {
    return (
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(12,74,68,0.15)", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.forestFill, borderWidth: 3, borderColor: "#FFFFFF" }} />
      </View>
    );
  }
  const pickup = kind === "pickup";
  return <View style={{ width: pickup ? 24 : 20, height: pickup ? 24 : 20, borderRadius: 12, backgroundColor: pickup ? colors.accent : colors.forestFill, borderWidth: pickup ? 3 : 2, borderColor: "#FFFFFF" }} />;
}

/** A big tinted square with an icon, centred above a title (`.tile` 104px on Payment). */
export function BigTile({ icon, bg, fg }: { icon: AppIconName; bg: string; fg: string }) {
  return (
    <View style={{ width: 104, height: 104, borderRadius: 34, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <AppIcon name={icon} size={46} color={fg} />
    </View>
  );
}

/** The green tick on "Delivered" (`.check`). */
export function DoneCheck() {
  return (
    // A solid green disc in a soft halo: the "Delivery done!" moment.
    <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: colors.successFill, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name="check" size={46} color="#FFFFFF" strokeWidth={2.8} />
      </View>
    </View>
  );
}

/** An underlined text button (`.link`): "Something wrong?". */
export function TextLink({ title, onPress, color = colors.ink }: { title: string; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={{ minHeight: 44, alignSelf: "center", justifyContent: "center", paddingHorizontal: 10 }}>
      <T weight="bold" style={{ fontSize: 15, color, textDecorationLine: "underline" }}>{title}</T>
    </Pressable>
  );
}

/** Centred column for big moments (welcome, payment, delivered). */
export function Center({ children, top = 40 }: { children: ReactNode; top?: number }) {
  return <View style={{ alignItems: "center", gap: 14, paddingTop: top }}>{children}</View>;
}

/** Big Bricolage line inside a card ("Yaba → Lekki" on the new job card). */
export function CardTitle({ children, color = colors.ink, size = 28 }: { children: ReactNode; color?: string; size?: number }) {
  return <T style={{ fontFamily: fonts.display, fontSize: size, lineHeight: Math.round(size * 1.12), letterSpacing: -0.02 * size, color }}>{children}</T>;
}
