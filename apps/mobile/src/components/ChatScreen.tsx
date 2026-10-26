import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { HelpButton } from "@/components/Help";
import { VoiceInput } from "@/components/VoiceInput";
import { HeaderBack } from "@/components/Screen";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";
import { KeyboardShift, useScrollToEndOnKeyboard } from "@/components/KeyboardShift";

// The frame shared by the conversation screens (customer thread, partner chat, Rex): header, scrolling
// messages that stick to the bottom, and a composer. Peggy's screen predates it and keeps its own copy.

export function ChatScreen({
  header,
  children,
  composer,
  refreshing,
  onRefresh,
  scrollKey,
  help = true,
  backTo = "/chats",
}: {
  header: ReactNode;
  children: ReactNode;
  composer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Changes when a message is added, to scroll to the newest one. */
  scrollKey?: string | number;
  /** Help in the header (build spec 8A). */
  help?: boolean;
  /** Where Back goes when there is nothing to go back to (a deep link or a push). */
  backTo?: string;
}) {
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [scrollKey]);
  useScrollToEndOnKeyboard(scroll);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardShift>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, paddingRight: 20, paddingVertical: 8 }}>
          <HeaderBack onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo as never))} />
          {header}
          {help ? <HelpButton /> : null}
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
        {composer}
      </KeyboardShift>
    </SafeAreaView>
  );
}

export function Bubble({ mine, note, children, meta, failed }: { mine: boolean; note?: boolean; children: ReactNode; meta?: string; failed?: boolean }) {
  const bg = note ? "#FDF0D5" : mine ? colors.ink : colors.surface;
  const fg = note ? "#5C3D00" : mine ? "#FFFFFF" : colors.ink;
  return (
    <View style={{ alignSelf: mine || note ? "flex-end" : "flex-start", maxWidth: "86%", gap: 3 }}>
      <View style={{ backgroundColor: bg, borderRadius: 20, borderBottomRightRadius: mine || note ? 6 : 20, borderTopLeftRadius: mine || note ? 20 : 6, paddingHorizontal: 15, paddingVertical: 11 }}>
        {typeof children === "string" ? <T style={{ color: fg, fontSize: 15, lineHeight: 21 }}>{children}</T> : children}
      </View>
      {meta ? <T style={{ fontSize: 11.5, color: failed ? colors.danger : colors.inkSoft, textAlign: mine || note ? "right" : "left", paddingHorizontal: 6 }}>{meta}</T> : null}
    </View>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  busy,
  placeholder,
  disabled,
  above,
  attach,
  ready,
  voice = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  busy?: boolean;
  placeholder: string;
  disabled?: boolean;
  above?: ReactNode;
  /** A button before the text box (Rex: attach photos). */
  attach?: ReactNode;
  /** Send works without words (photos attached). */
  ready?: boolean;
  /** The mic for voice typing (build spec 8A), next to Send. */
  voice?: boolean;
}) {
  const off = disabled || busy || !(value.trim() || ready);
  const t = useT("common");
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6, gap: 8 }}>
      {above}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {attach}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          multiline
          editable={!disabled}
          accessibilityLabel={placeholder}
          style={{ flex: 1, minHeight: 50, maxHeight: 140, borderRadius: radii.field + 8, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, fontSize: 16, fontFamily: fonts.regular, color: colors.ink }}
        />
        {voice ? <VoiceInput variant="icon" value={value} onChange={onChange} context="a chat message" disabled={disabled} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t("send")} accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onSend} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", opacity: off ? 0.5 : 1 }}>
          <AppIcon name="send" size={20} color="#FFFFFF" strokeWidth={2.1} />
        </Pressable>
      </View>
    </View>
  );
}
