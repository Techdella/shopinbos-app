import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { transcribeRecording } from "@/lib/voice";
import { VOICE_COPY, VOICE_MAX_SECONDS, mergeVoiceText, voiceTimer } from "@shared/voice-input";
import { useT } from "@/lib/i18n";
import { colors, fonts } from "@/theme";

// Voice typing for long text fields (build spec 8A): "Tap and speak", "Listening… tap to stop" with a timer,
// "Writing it down…", then the words go into the field (after what's there, or instead of it). Put it under
// the field ("full") or next to a chat box ("icon"). Stops on its own at one minute.

type Phase = "idle" | "listening" | "working";

// Speech needs far less than music: mono AAC at 64 kbps keeps a minute well under 1 MB.
const SPEECH_PRESET = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };

export function VoiceInput({
  value,
  onChange,
  mode = "append",
  maxLength,
  context,
  language,
  variant = "full",
  style,
  disabled,
  testID = "voice-input",
  onSpoken,
}: {
  value: string;
  onChange: (next: string) => void;
  mode?: "append" | "replace";
  maxLength?: number;
  /** What the field is ("product description"), a hint for the speech model. */
  context?: string;
  /** The person's app language when the screen knows it (riders pick one); otherwise the phone's. */
  language?: string | null;
  variant?: "full" | "icon";
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
  /** Chats: send what was said straight away (with the merged words), instead of only filling the box. */
  onSpoken?: (text: string) => void;
}) {
  const t = useT("m_ui");
  /** VOICE_COPY in the app language (m_ui "voice.*"); other text (the server's own words) as it is. */
  const copy = (key: keyof typeof VOICE_COPY) => t(`voice.${key}`);
  const translated = (text: string) => {
    const key = (Object.keys(VOICE_COPY) as Array<keyof typeof VOICE_COPY>).find((name) => VOICE_COPY[name] === text);
    return key ? copy(key) : text;
  };
  const recorder = useAudioRecorder(SPEECH_PRESET);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const startedAt = useRef(0);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const elapsed = phase === "listening" ? state.durationMillis : 0;

  async function allowed(): Promise<boolean> {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) return true;
    // The web build has no native alerts: the browser's own prompt asks, and a refusal shows the plain line.
    if (Platform.OS === "web") {
      const asked = await requestRecordingPermissionsAsync().catch(() => null);
      if (!asked?.granted) setMessage(copy("deniedWeb"));
      return Boolean(asked?.granted);
    }
    if (!current.canAskAgain) {
      setMessage(copy("deniedPhone"));
      Alert.alert(t("voice.allowTitle"), copy("deniedPhone"), [
        { text: t("voice.notNow"), style: "cancel" },
        { text: t("voice.openSettings"), onPress: () => void Linking.openSettings() },
      ]);
      return false;
    }
    // Say why before the system asks, in plain words.
    const go = await new Promise<boolean>((resolve) =>
      Alert.alert(t("voice.whyTitle"), t.dynamic("voice.permissionWhy", VOICE_COPY.permissionWhy), [
        { text: t("voice.notNow"), style: "cancel", onPress: () => resolve(false) },
        { text: t("voice.allow"), onPress: () => resolve(true) },
      ]),
    );
    if (!go) return false;
    const asked = await requestRecordingPermissionsAsync();
    if (!asked.granted) setMessage(copy("deniedPhone"));
    return asked.granted;
  }

  async function start() {
    setMessage(null);
    try {
      if (!(await allowed())) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_MAX_SECONDS });
      startedAt.current = Date.now();
      setPhase("listening");
    } catch {
      setPhase("idle");
      setMessage(t("voice.noMicPhone"));
    }
  }

  async function stop() {
    const durationMs = Math.min(Date.now() - startedAt.current, VOICE_MAX_SECONDS * 1000);
    setPhase("working");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri || durationMs < 400) {
        setMessage(copy("nothingHeard"));
        return;
      }
      const text = await transcribeRecording({ uri, durationMs, language, context });
      if (!text) setMessage(copy("nothingHeard"));
      else {
        const merged = mergeVoiceText(latest.current, text, mode, maxLength);
        if (onSpoken) onSpoken(merged);
        else onChange(merged);
      }
    } catch (error) {
      setMessage(error instanceof Error ? translated(error.message) : copy("failed"));
    } finally {
      setPhase("idle");
    }
  }

  // The recorder stops itself at one minute (forDuration); pick that up and send what was said.
  useEffect(() => {
    if (phase === "listening" && !state.isRecording && Date.now() - startedAt.current > 1500) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording]);

  function press() {
    if (phase === "listening") void stop();
    else if (phase === "idle") void start();
  }

  const listening = phase === "listening";
  const label = listening ? copy("listening") : phase === "working" ? copy("working") : copy("idle");

  if (variant === "icon") {
    return (
      <View style={style}>
        {/* Next to a chat box there's no room for a line under the button: the message floats above it. */}
        {message && phase === "idle" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("voice.tapToClose", { message })} onPress={() => setMessage(null)} style={{ position: "absolute", bottom: 58, right: 0, width: 240, backgroundColor: colors.inkFill, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, zIndex: 10 }}>
            <T accessibilityLiveRegion="polite" style={{ color: "#FFFFFF", fontSize: 13.5, lineHeight: 18 }}>{message}</T>
          </Pressable>
        ) : null}
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={listening ? `${label} ${voiceTimer(elapsed)}` : label}
          accessibilityState={{ disabled: disabled || phase === "working", busy: phase === "working" }}
          disabled={disabled || phase === "working"}
          onPress={press}
          style={({ pressed }) => ({ width: 50, height: 50, borderRadius: 25, backgroundColor: listening ? colors.accent : colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}
        >
          {/* Fixed size so the chat box never jumps: while listening the timer replaces the mic. */}
          {phase === "working" ? <ActivityIndicator color={colors.ink} /> : listening ? <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, color: "#FFFFFF", fontSize: 14, fontVariant: ["tabular-nums"] }}>{voiceTimer(elapsed)}</T> : <AppIcon name="mic" size={20} color={colors.ink} />}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[{ gap: 6, alignItems: "flex-start" }, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={listening ? `${label} ${voiceTimer(elapsed)}` : label}
        accessibilityState={{ disabled: disabled || phase === "working", busy: phase === "working" }}
        disabled={disabled || phase === "working"}
        onPress={press}
        style={({ pressed }) => ({ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 6, paddingRight: 18, borderRadius: 26, borderWidth: listening ? 0 : 1, borderColor: colors.line, backgroundColor: listening ? colors.accent : colors.surface, opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: listening ? "rgba(255,255,255,0.22)" : colors.peach }}>
          {phase === "working" ? <ActivityIndicator color={colors.accentInk} /> : <AppIcon name="mic" size={20} color={listening ? "#FFFFFF" : colors.accentInk} />}
        </View>
        <T weight="bold" style={{ fontSize: 15, color: listening ? "#FFFFFF" : colors.ink }}>{label}</T>
        {listening ? <T weight="bold" style={{ fontSize: 15, color: "#FFFFFF", fontFamily: fonts.bold, fontVariant: ["tabular-nums"] }}>{voiceTimer(elapsed)}</T> : null}
      </Pressable>
      {message && phase === "idle" ? (
        <T accessibilityLiveRegion="polite" style={{ fontSize: 14, color: colors.inkSoft }}>{message}</T>
      ) : null}
    </View>
  );
}
