import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { ONBOARDING_LANGUAGES, REX_GREETING, SELL_EXAMPLES, START_PATHS, type StartPath } from "@shared/onboarding";
import { List, Row, Seg } from "@/components/design";
import { Mascot, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { OnboardingWelcome, onboardingWelcomeSeen } from "@/components/OnboardingWelcome";
import { useOnboarding } from "@/components/OnboardingContext";
import { askRex, saveMemory } from "@/lib/onboarding";
import { colors, fonts, radii } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";
import { localeFromName } from "@shared/i18n";
import { useLocale, useSetLocale, useT } from "@/lib/i18n";

interface Turn {
  from: "rex" | "me";
  text: string;
}

export default function Chat() {
  const { status, lang, setLang: setRexLang, description, setDescription } = useOnboarding();
  // One choice for Rex's chat language and the app language (shared/i18n).
  const appLocale = useLocale();
  const setAppLocale = useSetLocale();
  const tSettings = useT("settings");
  const t = useT("m_onboarding", "common");
  const setLang = (item: (typeof ONBOARDING_LANGUAGES)[number]) => {
    setRexLang(item);
    const locale = localeFromName(item);
    if (locale && locale !== appLocale) void setAppLocale(locale);
  };
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => (description ? [{ from: "me", text: description }] : []));
  const [thinking, setThinking] = useState(false);
  const name = status?.ownerName.split(/\s+/)[0] || t("chat.there");
  const answered = turns.some((turn) => turn.from === "rex") || (turns.length > 0 && !thinking);
  // First visit: "Welcome to Shopinbos, {name}" with Rex's hello clip, then the chat (Prototype 10).
  const [intro, setIntro] = useState(() => !description && !onboardingWelcomeSeen());

  if (intro) return <OnboardingWelcome name={status?.ownerName} onDone={() => setIntro(false)} />;

  async function send() {
    const message = draft.trim();
    if (!message || thinking) return;
    setDraft("");
    setDescription(message);
    setTurns((current) => [...current, { from: "me", text: message }]);
    setThinking(true);
    try {
      const result = await askRex(message, { businessDescription: message, languages: [lang], preferredName: status?.ownerName });
      setTurns((current) => [...current, { from: "rex", text: `${result.reply ?? t("chat.loveIt")} ${t("chat.whereFrom")}` }]);
    } catch {
      setTurns((current) => [...current, { from: "rex", text: `${t("chat.gotIt")} ${t("chat.whereFrom")}` }]);
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
      chat
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel={t("chat.label")}
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            style={{ flex: 1, height: 54, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 20, fontSize: 16, fontFamily: fonts.regular, color: colors.ink }}
          />
          <VoiceInput variant="icon" value={draft} onChange={setDraft} language={lang} context="what their shop sells" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("send")}
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
        <Mascot name="rex" mood="wave" size={56} />
        <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, borderTopLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 14 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 }} accessibilityRole="header">{REX_GREETING[lang](name)}</T>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {ONBOARDING_LANGUAGES.map((item) => <Seg key={item} label={item} on={lang === item} onPress={() => setLang(item)} />)}
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{tSettings("language.onboarding")}</T>
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
        {thinking && <T style={{ color: colors.inkSoft }}>{t("chat.thinking")}</T>}
      </View>
      {!turns.length && (
        <Pressable onPress={() => setDraft(SELL_EXAMPLES[lang])} style={{ marginTop: 14 }}>
          <T style={{ color: colors.inkSoft, fontSize: 14, textDecorationLine: "underline" }}>{t("chat.example", { example: SELL_EXAMPLES[lang] })}</T>
        </Pressable>
      )}
      {answered && (
        <List style={{ marginTop: 18 }}>
          {START_PATHS.map((path, index) => (
            <Row
              key={path.key}
              lead={
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: path.tint, alignItems: "center", justifyContent: "center" }}>
                  <T weight="extrabold" style={{ fontSize: 16 }}>{index + 1}</T>
                </View>
              }
              title={t.dynamic(`path.${path.key}.label`, path.label)}
              sub={t.dynamic(`path.${path.key}.hint`, path.hint)}
              onPress={() => void choose(path.key)}
            />
          ))}
        </List>
      )}
    </OnboardingFrame>
  );
}
