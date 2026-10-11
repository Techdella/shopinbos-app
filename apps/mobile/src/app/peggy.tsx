import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { BackButton, Chip, Mascot, T } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts, radii } from "@/theme";

const SUGGESTIONS = ["How did I do this week?", "What should I restock?", "Which orders need me today?", "Write a WhatsApp status for my best seller"];

interface Turn {
  from: "me" | "peggy";
  text: string;
}

export default function Peggy() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroll = useRef<ScrollView>(null);

  async function ask(text = draft) {
    const message = text.trim();
    if (!message || thinking) return;
    setDraft("");
    setTurns((current) => [...current, { from: "me", text: message }]);
    setThinking(true);
    try {
      const result = await api<{ text: string }>("/api/app/peggy", { method: "POST", json: { message } });
      setTurns((current) => [...current, { from: "peggy", text: result.text }]);
    } catch (askError) {
      setTurns((current) => [...current, { from: "peggy", text: askError instanceof Error ? askError.message : "I couldn't answer just now. Try again in a moment." }]);
    } finally {
      setThinking(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          <Mascot name="peggy" size={40} />
          <View>
            <T weight="extrabold" style={{ fontSize: 16 }}>Peggy</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>Knows your orders, stock and sales</T>
          </View>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {!turns.length && (
            <>
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, padding: 14 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>Hi! Ask me anything about your shop. I can see your orders, stock and sales.</T>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SUGGESTIONS.map((suggestion) => <Chip key={suggestion} label={suggestion} on={false} onPress={() => void ask(suggestion)} />)}
              </View>
            </>
          )}
          {turns.map((turn, index) =>
            turn.from === "me" ? (
              <View key={index} style={{ alignSelf: "flex-end", marginLeft: 40, backgroundColor: colors.ink, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
                <T style={{ color: "#FFFFFF", fontSize: 15, lineHeight: 21 }}>{turn.text}</T>
              </View>
            ) : (
              <View key={index} style={{ marginRight: 24, backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>{turn.text}</T>
              </View>
            ),
          )}
          {thinking && <T style={{ color: colors.inkSoft }}>Peggy is thinking…</T>}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask Peggy about your shop"
            placeholderTextColor={colors.inkFaint}
            onSubmitEditing={() => void ask()}
            returnKeyType="send"
            accessibilityLabel="Ask Peggy"
            style={{ flex: 1, height: 54, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 20, fontSize: 16, fontFamily: fonts.regular, color: colors.ink }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!draft.trim() || thinking} onPress={() => void ask()} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", opacity: !draft.trim() || thinking ? 0.5 : 1 }}>
            <AppIcon name="chevron" size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
