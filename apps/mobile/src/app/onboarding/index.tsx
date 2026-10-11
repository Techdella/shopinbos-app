import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import Svg, { Path, Rect } from "react-native-svg";
import { ONBOARDING_LANGUAGES, REX_GREETING, SELL_EXAMPLES, START_PATHS, type StartPath } from "@shared/onboarding";
import { Chip, Mascot, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { askRex, saveMemory } from "@/lib/onboarding";
import { colors, fonts, radii } from "@/theme";

interface Turn {
  from: "rex" | "me";
  text: string;
}

export default function Chat() {
  const { status, lang, setLang, description, setDescription } = useOnboarding();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => (description ? [{ from: "me", text: description }] : []));
  const [thinking, setThinking] = useState(false);
  const name = status?.ownerName.split(/\s+/)[0] || "there";
  const answered = turns.some((turn) => turn.from === "rex") || (turns.length > 0 && !thinking);

  async function send() {
    const message = draft.trim();
    if (!message || thinking) return;
    setDraft("");
    setDescription(message);
    setTurns((current) => [...current, { from: "me", text: message }]);
    setThinking(true);
    try {
      const result = await askRex(message, { businessDescription: message, languages: [lang], preferredName: status?.ownerName });
      setTurns((current) => [...current, { from: "rex", text: `${result.reply ?? "Love it."} Where are you starting from?` }]);
    } catch {
      setTurns((current) => [...current, { from: "rex", text: "Got it. Where are you starting from?" }]);
    } finally {
      setThinking(false);
    }
  }

  async function choose(path: StartPath) {
    await saveMemory(
      { businessDescription: description, languages: [lang], screen: "brand" },
      status?.store.live ? { onboardingState: "BUILDING_REX" } : { onboardingState: "BUILDING_REX", status: "draft" },
    ).catch(() => null);
    router.push({ pathname: "/onboarding/brand", params: { start: path } });
  }

  return (
    <OnboardingFrame
      step="chat"
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type what you sell"
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel="Tell Rex what you sell"
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            style={{ flex: 1, height: 54, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 20, fontSize: 16, fontFamily: fonts.regular, color: colors.ink }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record a voice note"
            onPress={() => Alert.alert("Voice notes are coming", "Voice notes arrive in the next app update. Type what you sell for now.")}
            style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
              <Rect x="9" y="3" width="6" height="11" rx="3" />
              <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </Svg>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!draft.trim() || thinking}
            onPress={() => void send()}
            style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", opacity: !draft.trim() || thinking ? 0.5 : 1 }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12h14M13 6l6 6-6 6" />
            </Svg>
          </Pressable>
        </View>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <Mascot name="rex" size={56} />
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 14 }}>
          <T weight="bold" style={{ fontSize: 16, lineHeight: 22 }}>{REX_GREETING[lang](name)}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {ONBOARDING_LANGUAGES.map((item) => <Chip key={item} label={item} on={lang === item} onPress={() => setLang(item)} />)}
      </View>
      <View style={{ gap: 12, marginTop: 18 }}>
        {turns.map((turn, index) =>
          turn.from === "me" ? (
            <View key={index} style={{ alignSelf: "flex-end", marginLeft: 40, backgroundColor: colors.ink, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 14 }}>
              <T style={{ color: "#FFFFFF", fontSize: 15, lineHeight: 21 }}>{turn.text}</T>
            </View>
          ) : (
            <View key={index} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginRight: 24 }}>
              <Mascot name="rex" size={32} />
              <View style={{ flexShrink: 1, backgroundColor: colors.surface, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 14 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>{turn.text}</T>
              </View>
            </View>
          ),
        )}
        {thinking && <T style={{ color: colors.inkSoft }}>Rex is thinking…</T>}
      </View>
      {!turns.length && (
        <Pressable onPress={() => setDraft(SELL_EXAMPLES[lang])} style={{ marginTop: 14 }}>
          <T style={{ color: colors.inkSoft, fontSize: 13, textDecorationLine: "underline" }}>Example: {SELL_EXAMPLES[lang]}</T>
        </Pressable>
      )}
      {answered && (
        <View style={{ gap: 12, marginTop: 18 }}>
          {START_PATHS.map((path, index) => (
            <Pressable key={path.key} accessibilityRole="button" onPress={() => void choose(path.key)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, borderWidth: 2, borderColor: pressed ? colors.ink : "transparent" })}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: path.tint, alignItems: "center", justifyContent: "center" }}>
                <T style={{ fontSize: 16 }}>{index + 1}</T>
              </View>
              <View>
                <T weight="extrabold" style={{ fontSize: 15 }}>{path.label}</T>
                <T style={{ color: colors.inkSoft, fontSize: 13 }}>{path.hint}</T>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </OnboardingFrame>
  );
}
