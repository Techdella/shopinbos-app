import type { ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sub, Title } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Mascot, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import type { Job, MarketConnectionRow, RiderRow } from "@/lib/logistics";
import { initialsOf } from "@/lib/logistics-pure";
import { timeAgo } from "@/lib/partner-pure";
import { colors, fonts } from "@/theme";

// Small pieces of the "Delivery partner app" prototype that the shared design kit doesn't have: the company initials
// circle, labelled inputs (`.lbl` + `.inp`), the narrow price box on rate rows, stat cards, a wrap of chips, a tinted
// note card and the centred "done" screens (a green circle, a big title, one line and one button).

/** Mint initials circle (`.ini`). */
export function Initial({ name, size = 44, bg = colors.mintTint, fg = colors.forest }: { name: string; size?: number; bg?: string; fg?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no">
      <T weight="extrabold" style={{ fontSize: Math.round(size * 0.34), color: fg }}>{initialsOf(name)}</T>
    </View>
  );
}

/** A labelled input (`.lbl` over `.inp`). */
export function LabeledInput({ label, style, ...props }: { label: string } & TextInputProps) {
  return (
    <View>
      <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft, marginBottom: 8 }}>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkFaint}
        style={[{ minHeight: 58, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 16, fontSize: 18, fontFamily: fonts.semibold, color: colors.ink }, style]}
        {...props}
      />
    </View>
  );
}

/** The 96px price box at the end of a rate row. */
export function PriceBox({ value, onChangeText, label }: { value: string; onChangeText: (text: string) => void; label: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/[^\d,]/g, ""))}
      keyboardType="number-pad"
      accessibilityLabel={label}
      placeholder="₦"
      placeholderTextColor={colors.inkFaint}
      style={{ width: 96, minHeight: 44, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, textAlign: "right", fontSize: 18, fontFamily: fonts.extrabold, color: colors.ink }}
    />
  );
}

/** A label over chips (`.lbl` + `.chips`). */
export function ChipWrap({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View>
      {label ? <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft, marginBottom: 8 }}>{label}</T> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>
    </View>
  );
}

/** One of the three numbers on Business (`★ 4.7` over "312 deliveries"). */
export function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 2 }} accessible accessibilityLabel={`${value} ${label}`}>
      <T weight="bold" style={{ fontSize: 20 }}>{value}</T>
      <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{label}</T>
    </View>
  );
}

/** A tinted card with a bold first line (the amber pay-on-delivery and failed-attempt cards, mint "Marked as sent"). */
export function NoteCard({ title, children, tone = "warn" }: { title: string; children?: ReactNode; tone?: "warn" | "mint" }) {
  const bg = tone === "warn" ? colors.warnTint : colors.mintTint;
  const fg = tone === "warn" ? colors.warnInk : colors.forest;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 24, padding: 20, gap: 8 }}>
      <T weight="extrabold" style={{ fontSize: 16, color: tone === "warn" ? colors.ink : colors.forest }}>{title}</T>
      {typeof children === "string" ? <T style={{ fontSize: 16, lineHeight: 24, color: fg }}>{children}</T> : children}
    </View>
  );
}

/** A tappable white card row with a tile, a title, a line and a chevron (`button.card.pad` with a row inside). */
export function CardButton({ icon, tint = "#FFFFFF", iconBg = colors.mintTint, iconFg = colors.forest, title, sub, onPress, style }: { icon: AppIconName; tint?: string; iconBg?: string; iconFg?: string; title: string; sub?: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      onPress={onPress}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 14, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: tint === "#FFFFFF" ? colors.line : tint, backgroundColor: tint, opacity: pressed ? 0.9 : 1 }, style]}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={22} color={iconFg} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="bold" style={{ fontSize: 16 }}>{title}</T>
        {sub ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{sub}</T> : null}
      </View>
      <AppIcon name="chevron" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}

/** A centred "done" screen (`.center` + `.check`): no header, a big title, one line, the button pinned below. */
export function DoneScreen({ icon = "check", title, sub, footer }: { icon?: AppIconName; title: string; sub?: string; footer: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 90, paddingBottom: 24, alignItems: "center", gap: 14 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={icon} size={44} color={colors.success} strokeWidth={2.2} />
        </View>
        <Title style={{ textAlign: "center" }}>{title}</Title>
        {sub ? <Sub style={{ textAlign: "center" }}>{sub}</Sub> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 10, gap: 10 }}>{footer}</View>
    </SafeAreaView>
  );
}

/** Step counter ("1 of 6") with a round back button, at the top of a set-up step (`.hdr` in the flow screens). */
export function StepHeader({ step, total, label, onBack, backLabel }: { step: number; total: number; label: string; onBack: () => void; backLabel: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} hitSlop={6} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <AppIcon name="chevron" size={20} color={colors.ink} strokeWidth={2.2} />
        </View>
      </Pressable>
      <T weight="semibold" style={{ flex: 1, fontSize: 13, color: colors.inkSoft }} accessibilityLabel={`${step} / ${total}`}>{label}</T>
    </View>
  );
}

/** Where a rider is, in words: "Free now · last seen 2 min ago, Ikeja", "2 on the road", "Offline · seen 3 h ago". */
export function useRiderWhere() {
  const t = useT("m_partner");
  return (rider: RiderRow) =>
    !rider.active
      ? t("riders.isPaused")
      : rider.out
        ? [rider.openJobs ? t("riders.onRoad", { count: rider.openJobs }) : t("riders.free"), rider.where].filter(Boolean).join(" · ")
        : rider.lastSeenAt
          ? t("riders.offlineSeen", { ago: timeAgo(rider.lastSeenAt, undefined, t) })
          : t("riders.isOffline");
}

/** The partner tint (prototype `.tb.teal`): the pill behind the active tab icon on Android. */
export const PARTNER_TINT = "#D6F0E9";

/** Seller or supplier, for "Glow by Amaka (Seller)": the connection's role when there is one; otherwise a job with a
 * pickup window is a supplier's (supplier pickups carry one), else a seller's. */
export function shopRoleOf(job: Pick<Job, "sellerUserId" | "pickupWindow">, connections: readonly Pick<MarketConnectionRow, "ownerUserId" | "ownerRole">[] = []): "seller" | "supplier" {
  const role = connections.find((row) => row.ownerUserId === job.sellerUserId)?.ownerRole;
  if (role === "supplier" || role === "seller") return role;
  return job.pickupWindow ? "supplier" : "seller";
}

/** A round 44px header button holding Peggy's head (prototype `.iconb .head.peg`). */
export function PeggyButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: pressed ? 0.8 : 1 })}>
      <Mascot who="peggy" size={36} label="" />
    </Pressable>
  );
}

/** One job on Jobs (prototype `jobList` card): shop and role over the fee, a big "Yaba → Lekki" route between a teal
 * and an orange dot, and one grey line (time, size, pay on delivery). */
export function RouteCard({ shop, who, fee, from, to, sub, label, onPress }: { shop: string; who: string; fee: string; from: string; to: string; sub: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 10, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <T weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
          {shop}
          <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{`  ${who}`}</T>
        </T>
        <T weight="extrabold" style={{ fontSize: 16 }}>{fee}</T>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.forest }} />
        <T numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 21, maxWidth: "40%" }}>{from}</T>
        {/* iOS only dashes a border drawn on every side: a 2px-tall dashed box reads as one dashed line. */}
        <View style={{ flex: 1, minWidth: 12, height: 2, borderWidth: 1, borderStyle: "dashed", borderRadius: 1, borderColor: colors.lineStrong }} />
        <T numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 21, maxWidth: "40%" }}>{to}</T>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />
      </View>
      {sub ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }} numberOfLines={2}>{sub}</T> : null}
    </Pressable>
  );
}
