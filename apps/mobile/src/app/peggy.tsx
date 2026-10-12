import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { BackButton, Chip, Mascot, T } from "@/components/ui";
import { api } from "@/lib/api";
import { openPath } from "@/lib/web";
import { colors, fonts, radii } from "@/theme";

const SUGGESTIONS = [
  "How did I do this week?",
  "Which orders do I need to send?",
  "What should I restock?",
  "Make a 10% discount code for this weekend",
  "Write a WhatsApp status for my best seller",
  "Draft a blog post about my best seller",
];

interface PeggyAction {
  tool: string;
  summary: string;
  href?: string;
}

interface Turn {
  from: "me" | "peggy";
  text: string;
  actions?: PeggyAction[];
  /** Errors are shown but not sent back to Peggy as part of the conversation. */
  failed?: boolean;
}

const MAX_TURNS = 20;

export default function Peggy() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // Start here and other screens open Peggy with a question ready (?prompt=…); it's asked once.
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const asked = useRef(false);

  async function ask(text = draft) {
    const message = text.trim();
    if (!message || thinking) return;
    setDraft("");
    const next: Turn[] = [...turns, { from: "me", text: message }];
    setTurns(next);
    setThinking(true);
    try {
      // The whole conversation goes to Peggy so she remembers what was said (the server keeps the last 20 turns).
      const messages = next
        .filter((turn) => !turn.failed)
        .slice(-MAX_TURNS)
        .map((turn) => ({ role: turn.from === "me" ? "user" : "assistant", content: turn.text.slice(0, 4000) }));
      const result = await api<{ text: string; actions?: PeggyAction[] }>("/api/app/peggy", { method: "POST", json: { messages } });
      setTurns((current) => [...current, { from: "peggy", text: result.text, actions: result.actions ?? [] }]);
    } catch (askError) {
      setTurns((current) => [...current, { from: "peggy", failed: true, text: askError instanceof Error ? askError.message : "I couldn't answer just now. Try again in a moment." }]);
    } finally {
      setThinking(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  useEffect(() => {
    if (!prompt || asked.current) return;
    asked.current = true;
    void ask(prompt);
    // Only on open: `ask` changes every render.
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          <Mascot name="peggy" size={40} />
          <View>
            <T weight="extrabold" style={{ fontSize: 16 }}>Peggy</T>
            <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>Checks your shop and gets things done</T>
          </View>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {!turns.length && (
            <>
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, padding: 14 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>Hi! I can check your orders, stock and sales, and do the work: mark orders paid or sent, change prices and stock, make discount codes, and draft blog posts, broadcasts and ads.</T>
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
              <View key={index} style={{ marginRight: 24, gap: 8 }}>
                <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <T style={{ fontSize: 15, lineHeight: 21, color: turn.failed ? colors.inkSoft : colors.ink }}>{turn.text}</T>
                </View>
                {turn.actions?.map((action, actionIndex) => (
                  <Pressable
                    key={actionIndex}
                    accessibilityRole={action.href ? "link" : undefined}
                    disabled={!action.href}
                    onPress={() => action.href && void openPath(action.href)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10 }}
                  >
                    <AppIcon name="sparkle" size={18} />
                    <View style={{ flex: 1 }}>
                      <T weight="extrabold" style={{ fontSize: 12, color: colors.inkSoft }}>Peggy did this</T>
                      <T style={{ fontSize: 13.5, lineHeight: 19 }}>{action.summary}</T>
                    </View>
                    {action.href ? <AppIcon name="chevron" size={16} color={colors.inkSoft} /> : null}
                  </Pressable>
                ))}
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
