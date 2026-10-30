import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { BackButton, Chip, Mascot, T } from "@/components/ui";
import { api } from "@/lib/api";
import { openPath } from "@/lib/web";
import { colors, fonts, radii, surfaceCard } from "@/theme";
import { HelpButton } from "@/components/Help";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { VoiceInput } from "@/components/VoiceInput";
import { useT } from "@/lib/i18n";
import { KeyboardShift, useScrollToEndOnKeyboard } from "@/components/KeyboardShift";

// m_chats keys
const SUGGESTIONS = ["peggy.suggest.1", "peggy.suggest.2", "peggy.suggest.3", "peggy.suggest.4", "peggy.suggest.5", "peggy.suggest.6"] as const;

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
  const t = useT("m_chats", "common");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // Start here and other screens open Peggy with a question ready (?prompt=…); it's asked once.
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const asked = useRef(false);
  useScrollToEndOnKeyboard(scroll);

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
      setTurns((current) => [...current, { from: "peggy", failed: true, text: askError instanceof Error ? askError.message : t("peggy.failed") }]);
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
      <KeyboardShift>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          <Mascot name="peggy" size={40} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 17 }}>Peggy</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{t("peggy.tagline")}</T>
          </View>
          <CallPeggyButton variant="icon" />
          <HelpButton />
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {!turns.length && (
            <>
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, padding: 14 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>{t("peggy.hello")}</T>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SUGGESTIONS.map((key) => <Chip key={key} label={t(key)} on={false} onPress={() => void ask(t(key))} />)}
              </View>
            </>
          )}
          {turns.map((turn, index) =>
            turn.from === "me" ? (
              <View key={index} style={{ alignSelf: "flex-end", marginLeft: 40, backgroundColor: colors.inkFill, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
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
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, ...surfaceCard(16), paddingHorizontal: 14, paddingVertical: 10 }}
                  >
                    <AppIcon name="sparkle" size={18} />
                    <View style={{ flex: 1 }}>
                      <T weight="extrabold" style={{ fontSize: 13.5, color: colors.inkSoft }}>{t("peggy.didThis")}</T>
                      <T style={{ fontSize: 14.5, lineHeight: 19 }}>{action.summary}</T>
                    </View>
                    {action.href ? <AppIcon name="chevron" size={16} color={colors.inkSoft} /> : null}
                  </Pressable>
                ))}
              </View>
            ),
          )}
          {thinking && <T style={{ color: colors.inkSoft }}>{t("peggy.thinking")}</T>}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("peggy.placeholder")}
            placeholderTextColor={colors.inkFaint}
            onSubmitEditing={() => void ask()}
            returnKeyType="send"
            accessibilityLabel={t("peggy.ask")}
            style={{ flex: 1, height: 54, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 20, fontSize: 16, fontFamily: fonts.regular, color: colors.ink }}
          />
          <VoiceInput variant="icon" value={draft} onChange={setDraft} onSpoken={(text) => void ask(text)} context="a question for Peggy" disabled={thinking} />
          <Pressable accessibilityRole="button" accessibilityLabel={t("send")} disabled={!draft.trim() || thinking} onPress={() => void ask()} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.inkFill, alignItems: "center", justifyContent: "center", opacity: !draft.trim() || thinking ? 0.5 : 1 }}>
            <AppIcon name="chevron" size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </View>
      </KeyboardShift>
    </SafeAreaView>
  );
}
