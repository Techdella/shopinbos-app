import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { LinkButton, Mascot, PillButton, T } from "@/components/ui";
import { RoundAction, RoundActions } from "@/components/visual";
import { useT } from "@/lib/i18n";
import type { CallPhase, LastCall, SavedEntry } from "@/lib/peggy-call";
import { callClock, savedKey, stepKey, type SetupView } from "@/lib/peggy-call-pure";
import { colors, fonts } from "@/theme";

// What a "Call Peggy" call looks like (the call itself is components/peggy/PeggyCallEngine.tsx): the full-screen
// sheet with Minimize, the small "Peggy is on the call" bar across the app while minimized, a toast for each thing
// she saves (or each screen she opens), and "Here's what Peggy saved" after the call. Peggy is always her avatar
// (PeggyAvatar, the Mascot with a soft pulse ring while she speaks), never a letter mark. Words in m_help ("call.*").

export interface LiveCall {
  phase: CallPhase;
  speaking: boolean;
  muted: boolean;
  startedAt: number | null;
  saved: SavedEntry[];
  status: SetupView | null;
  error: string | null;
  /** The call's cap (10 minutes on free plans), whether the "1 minute left" warning is on, and whether it's paid with credits. */
  maxSeconds?: number;
  warning?: boolean;
  paid?: boolean;
}

/** "9:12 left" while the call is live, "1 minute left…" in its last minute. */
function useTimeLeft(startedAt: number | null, maxSeconds: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || !maxSeconds) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, maxSeconds]);
  if (!startedAt || !maxSeconds) return null;
  return Math.max(0, maxSeconds - (now - startedAt) / 1000);
}

function useClock(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt ? callClock((now - startedAt) / 1000) : "";
}

/**
 * Peggy's avatar on a white disc, with a ring that pulses gently while she speaks (still when reduce motion is on).
 */
export function PeggyAvatar({ size, speaking = false, ring = "rgba(115,216,200,0.45)" }: { size: number; speaking?: boolean; ring?: string }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [still, setStill] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => alive && setStill(reduce))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!speaking || still) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, speaking, still]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} testID="peggy-avatar">
      {speaking && !still ? <Animated.View pointerEvents="none" style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: ring, opacity, transform: [{ scale }] }} /> : null}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Mascot who="peggy" mood={speaking ? "wave" : "idle"} size={Math.round(size * 0.85)} label="" />
      </View>
    </View>
  );
}

/** "Peggy added coverage: Abeokuta – Lafenwa, Kuto" */
export function useSavedLine() {
  const t = useT("m_help");
  return (item: SavedEntry) => t(savedKey(item.kind), { detail: item.detail });
}

function SavedList({ saved }: { saved: SavedEntry[] }) {
  const t = useT("m_help");
  const line = useSavedLine();
  if (!saved.length) return <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}>{t("call.nothingYet")}</T>;
  return (
    <View style={{ gap: 8 }}>
      {saved.map((item) => (
        <View key={item.id} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
            <AppIcon name="check" size={13} color={colors.forest} strokeWidth={3} />
          </View>
          <T style={{ flex: 1, color: "#FFFFFF", fontSize: 15, lineHeight: 21 }} numberOfLines={3}>{line(item)}</T>
        </View>
      ))}
    </View>
  );
}

/** The setup steps with ticks, ticking as Peggy saves. */
export function SetupTicks({ status, dark = false }: { status: SetupView | null; dark?: boolean }) {
  const t = useT("m_help");
  if (!status?.steps.length) return null;
  const ink = dark ? "#FFFFFF" : colors.ink;
  const soft = dark ? "rgba(255,255,255,0.7)" : colors.inkSoft;
  return (
    <View style={{ gap: 8 }} accessibilityLabel={t("call.progress", { done: status.done, total: status.total })}>
      <T weight="bold" style={{ color: soft, fontSize: 13, letterSpacing: 0.3 }}>{t("call.progress", { done: status.done, total: status.total })}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {status.steps.map((step) => (
          <View key={step.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 32, borderRadius: 16, backgroundColor: step.done ? (dark ? "rgba(115,216,200,0.22)" : colors.successTint) : dark ? "rgba(255,255,255,0.08)" : colors.canvas }}>
            <AppIcon name={step.done ? "check" : "clock"} size={13} color={step.done ? (dark ? colors.mintTint : colors.success) : soft} strokeWidth={2.6} />
            <T weight="semibold" style={{ fontSize: 13, color: step.done ? ink : soft }}>{t.dynamic(stepKey(step.id), step.id)}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The call, full screen. */
export function CallSheet({ call, onMinimize, onMute, onEnd }: { call: LiveCall; onMinimize: () => void; onMute: () => void; onEnd: () => void }) {
  const t = useT("m_help");
  const tc = useT("m_credits");
  const left = useTimeLeft(call.phase === "live" ? call.startedAt : null, call.maxSeconds);
  const insets = useSafeAreaInsets();
  const clock = useClock(call.phase === "live" ? call.startedAt : null);
  const live = call.phase === "live";
  const words = !live ? t("call.calling") : call.speaking ? t("call.speaking") : t("call.listening");
  return (
    <Modal visible animationType="slide" onRequestClose={onMinimize} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.forestFill, paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, minHeight: 48 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("call.minimize")} onPress={onMinimize} hitSlop={8} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", opacity: pressed ? 0.8 : 1 })}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <AppIcon name="chevron" size={16} color="#FFFFFF" />
            </View>
            <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, color: "#FFFFFF", fontSize: 15 }}>{t("call.minimize")}</T>
          </Pressable>
          <View style={{ flex: 1 }} />
          {clock ? <T weight="bold" style={{ color: "rgba(255,255,255,0.8)", fontSize: 15 }}>{clock}</T> : null}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 22 }}>
          <View style={{ alignItems: "center", gap: 12 }} accessibilityLiveRegion="polite">
            <View style={{ width: 132, height: 132, borderRadius: 66, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" }}>
              <PeggyAvatar size={108} speaking={call.speaking} />
            </View>
            <T style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 26, textAlign: "center" }} accessibilityRole="header">{words}</T>
            <T style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center" }}>{call.paid ? tc("pc.limit", { minutes: Math.round((call.maxSeconds ?? 600) / 60) }) : t("call.free")}</T>
            {left !== null ? (
              <View testID="peggy-call-time" style={{ backgroundColor: call.warning || left <= 60 ? "rgba(242,169,59,0.25)" : "rgba(255,255,255,0.1)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 }}>
                <T weight="bold" style={{ color: "#FFFFFF", fontSize: 14, textAlign: "center" }}>{call.warning || left <= 60 ? tc("pc.oneMinute") : tc("pc.timeLeft", { time: callClock(left) })}</T>
              </View>
            ) : null}
          </View>

          {call.error ? (
            <View style={{ backgroundColor: "rgba(232,106,79,0.2)", borderRadius: 16, padding: 14 }}>
              <T weight="semibold" style={{ color: "#FFFFFF", fontSize: 15 }}>{call.error}</T>
            </View>
          ) : null}

          <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 22, padding: 16, gap: 12 }}>
            <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 16 }}>{t("call.savedSoFar")}</T>
            <SavedList saved={call.saved} />
          </View>

          <SetupTicks status={call.status} dark />
        </ScrollView>

        {/* Call controls as round buttons (the call-screen look): Mute (white while muted) and a red End. */}
        <RoundActions style={{ paddingHorizontal: 40, paddingTop: 8 }}>
          {live ? <RoundAction onDark size={68} tone={call.muted ? "light" : "glass"} icon="mic" label={call.muted ? t("call.unmute") : t("call.mute")} onPress={onMute} /> : null}
          <RoundAction onDark size={68} tone="decline" icon="phone" label={t("call.end")} onPress={onEnd} />
        </RoundActions>
      </View>
    </Modal>
  );
}

/** The minimized call bar's height above the bottom safe area (the screens end this far up: CallSpace). */
export const CALL_BAR_HEIGHT = 56;

/**
 * Minimized: a slim strip along the bottom of the app, under the tab bar, in space the screens leave free for it
 * (CallSpace in PeggyCallHost.tsx), so the screen Peggy opened shows in full. Tap to open the call again. `note` is
 * the latest "Peggy opened Delivery" / "Peggy saved …" line, shown in the strip instead of over the screen's header.
 */
export function CallBar({ call, note, onOpen, onMute, onEnd }: { call: LiveCall; note?: string | null; onOpen: () => void; onMute: () => void; onEnd: () => void }) {
  const t = useT("m_help");
  const insets = useSafeAreaInsets();
  const line = useSavedLine();
  const last = call.saved[call.saved.length - 1];
  const sub = note ?? (last ? line(last) : null);
  return (
    <View testID="peggy-call-bar" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CALL_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.forestFill, zIndex: 50, elevation: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityLiveRegion="polite">
        <Pressable accessibilityRole="button" accessibilityLabel={t("call.open")} onPress={onOpen} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
          <PeggyAvatar size={36} speaking={call.speaking} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 14 }} numberOfLines={1}>{call.phase === "live" ? t("call.onCall") : t("call.calling")}</T>
            {sub ? <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 12.5 }} numberOfLines={1}>{sub}</T> : null}
          </View>
        </Pressable>
        {call.phase === "live" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={call.muted ? t("call.unmute") : t("call.mute")} onPress={onMute} hitSlop={4} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: call.muted ? "#FFFFFF" : "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="mic" size={18} color={call.muted ? colors.onAccent : "#FFFFFF"} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t("call.end")} onPress={onEnd} hitSlop={4} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.dangerFill, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="x" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}


/** After the call: everything Peggy saved, with Edit links, then the next step that's still missing. */
export function CallSummary({ saved, status, endedByPeggy = false, lastCall = null, editPathOf, nextLabel, onEdit, onContinue, onClose }: { saved: SavedEntry[]; status: SetupView | null; endedByPeggy?: boolean; lastCall?: LastCall | null; editPathOf: (item: SavedEntry) => string | null; nextLabel: string | null; onEdit: (path: string) => void; onContinue: () => void; onClose: () => void }) {
  const t = useT("m_help");
  const tc = useT("m_credits");
  const line = useSavedLine();
  // Ended at the time limit, and what a call paid with credits used (once ElevenLabs reported its length).
  const notes = [
    lastCall?.atLimit ? tc("pc.endedLimit", { minutes: Math.round(lastCall.maxSeconds / 60) }) : null,
    lastCall?.bill ? tc("pc.charged", { charged: lastCall.bill.charged, minutes: lastCall.bill.minutes, refunded: lastCall.bill.refunded }) : lastCall && lastCall.held > 0 ? tc("pc.settling") : null,
  ].filter((note): note is string => Boolean(note));
  return (
    <Sheet visible onClose={onClose} title={t("call.summaryTitle")} testID="peggy-call-summary">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <PeggyAvatar size={40} />
        <T weight="semibold" style={{ flex: 1, fontSize: 15, color: colors.inkSoft }} numberOfLines={2}>{endedByPeggy ? t("call.peggyEnded") : lastCall && lastCall.held > 0 ? tc("pc.covered") : t("call.free")}</T>
      </View>
      {notes.map((note) => (
        <T key={note} testID="peggy-call-note" style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{note}</T>
      ))}
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 4 }}>
        {saved.length ? (
          saved.map((item) => {
            const path = editPathOf(item);
            return (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 }}>
                <AppIcon name="check" size={16} color={colors.success} strokeWidth={3} />
                <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }} numberOfLines={3}>{line(item)}</T>
                {path ? <LinkButton title={t("call.edit")} color={colors.forest} onPress={() => onEdit(path)} style={{ paddingHorizontal: 6 }} /> : null}
              </View>
            );
          })
        ) : (
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("call.nothingSaved")}</T>
        )}
      </ScrollView>
      <SetupTicks status={status} />
      <PillButton tone="forest" title={nextLabel ? t("call.next", { step: nextLabel }) : t("call.done")} onPress={onContinue} />
    </Sheet>
  );
}
