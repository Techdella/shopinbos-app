import { useEffect } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Row, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { canCall, checkCallsAvailable, requestPeggyCall, usePeggyCall } from "@/lib/peggy-call";
import { colors, radii } from "@/theme";

// "Call Peggy · free": a voice call with Peggy, Shopinbos's AI customer support, that runs inside the app
// (components/peggy/PeggyCallHost.tsx, ElevenLabs' React Native SDK). She saves pickup details, areas, prices and
// notes while she talks, and the call can be minimized while people carry on in the app. Free: no AI credits.
// The button only shows when calls are switched on and this build can run them (not in Expo Go); otherwise it isn't
// there at all. There is no web or browser fallback.
// Free plans: 3 free calls a month, each up to 10 minutes; after them a call uses AI credits by the minute, and the
// button says so (m_credits "pc.*", never anything to buy: shared/store-payments.ts).
//   variant "button": the big button (setup welcome, Help, Start) · "compact": a small pill (setup steps) ·
//   "icon": a round phone button (Ask Peggy's header) · "row": a row in a List (Home, Account, Business).
//   "mic": a big round mic (Ask Peggy before the first question).

type Variant = "button" | "compact" | "icon" | "row" | "mic";

export function CallPeggyButton({ style, note = true, variant = "button" }: { style?: StyleProp<ViewStyle>; note?: boolean; variant?: Variant }) {
  const t = useT("m_help");
  const tc = useT("m_credits");
  const call = usePeggyCall();
  const paid = call.terms?.mode === "credits";
  const leftLine = paid && call.terms ? tc("pc.creditsNoteApp", { perMinute: call.terms.perMinute, hold: call.terms.hold }) : call.callsLeft !== null ? t("call.left", { count: call.callsLeft }) : null;
  const ready = canCall(call);

  useEffect(() => {
    checkCallsAvailable();
  }, []);

  if (!ready) return null;
  const busy = call.phase === "connecting";
  const onCall = call.phase === "connecting" || call.phase === "live";
  const press = () => void requestPeggyCall();
  const failed = call.phase === "idle" && call.error ? call.error : null;
  const title = onCall ? t("call.backTo") : paid && call.terms ? tc("pc.callCredits", { count: call.terms.perMinute }) : t("call.title");

  if (variant === "icon") {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={onCall ? t("call.backTo") : t("call.label")} onPress={press} hitSlop={6} style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.forestFill, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 }, style]}>
        <AppIcon name="phone" size={19} color="#FFFFFF" />
      </Pressable>
    );
  }

  if (variant === "mic") {
    // The voice-assistant look: one big round mic in a soft halo, "Call Peggy · free" under it.
    return (
      <Pressable testID="peggy-mic" accessibilityRole="button" accessibilityLabel={onCall ? t("call.backTo") : t("call.label")} onPress={press} disabled={busy} style={({ pressed }) => [{ alignItems: "center", gap: 10, opacity: pressed ? 0.85 : 1 }, style]}>
        <View style={{ width: 116, height: 116, borderRadius: 58, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.forestFill, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name={onCall ? "phone" : "mic"} size={36} color="#FFFFFF" />
          </View>
        </View>
        <T weight="bold" numberOfLines={1} style={{ fontSize: 15, color: colors.forest }}>{title}</T>
      </Pressable>
    );
  }
  if (variant === "compact") {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={onCall ? t("call.backTo") : t("call.label")} onPress={press} hitSlop={6} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.mintTint, opacity: pressed ? 0.85 : 1 }, style]}>
        <AppIcon name="phone" size={15} color={colors.forest} />
        <T weight="bold" style={{ fontSize: 14, color: colors.forest }} numberOfLines={1}>{onCall ? t("call.backTo") : t("call.short")}</T>
      </Pressable>
    );
  }

  if (variant === "row") {
    return <Row lead={<Tile icon="phone" tone="mint" />} title={title} sub={failed ?? leftLine ?? t("call.note")} onPress={press} accessibilityLabel={t("call.label")} />;
  }

  return (
    <View style={style}>
      <PillButton tone="forest" busy={busy} disabled={busy} onPress={press} accessibilityLabel={t("call.label")} icon="phone" title={title} />
      {note ? <T style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: colors.inkSoft }}>{t("call.note")}</T> : null}
      {leftLine ? <T style={{ marginTop: 4, textAlign: "center", fontSize: 13, color: colors.inkSoft }}>{leftLine}</T> : null}
      {failed ? <T style={{ marginTop: 6, textAlign: "center", fontSize: 13, color: colors.danger }}>{failed || t("call.failed")}</T> : null}
    </View>
  );
}
