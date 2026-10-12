import { useState } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { router, usePathname } from "expo-router";
import { AppIcon } from "@/components/icons";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { LinkButton, T } from "@/components/ui";
import { useRole } from "@/lib/role";
import { openSupportWhatsApp, SUPPORT_WHATSAPP } from "@/lib/support";
import { colors } from "@/theme";

// "Help" on every screen (build spec 8A): chat with a person on WhatsApp, or ask Peggy. Without a support
// WhatsApp number set (see SUPPORT_WHATSAPP), "Chat with a person" opens the in-app chat with the team.

export function HelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { role } = useRole();
  // Peggy works on a seller's shop; suppliers and delivery partners get a person.
  const peggy = !role || role === "seller";

  async function person() {
    onClose();
    if (await openSupportWhatsApp(`Hello Shopinbos, I need help in the app (${pathname}).`)) return;
    router.push({ pathname: "/help/chat", params: { from: pathname } });
  }

  function go(path: "/peggy" | "/help" | "/ask-us") {
    onClose();
    router.push(path);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="How can we help?" testID="help-sheet">
      <ChoiceRow
        testID="help-person"
        icon="chat"
        tint={colors.successTint}
        iconColor={colors.success}
        title={SUPPORT_WHATSAPP ? "Chat with a person on WhatsApp" : "Chat with a person"}
        sub={SUPPORT_WHATSAPP ? "Our team answers on WhatsApp. English or Pidgin." : "Our team answers you here in the app."}
        onPress={() => void person()}
      />
      {peggy ? <ChoiceRow testID="help-peggy" icon="sparkle" tint={colors.mintTint} iconColor={colors.forest} title="Ask Peggy" sub="Say what you need. She'll do it or show you how." onPress={() => go("/peggy")} /> : null}
      <ChoiceRow icon="settings" tint={colors.peach} iconColor={colors.accentInk} title="Ask us to set something up" sub="We do the hard parts for you." onPress={() => go("/ask-us")} />
      <LinkButton title="See my chats with the team" color={colors.inkSoft} onPress={() => go("/help")} />
    </Sheet>
  );
}

/** The Help pill for screen headers: an icon with the word, as the prototype has it. */
export function HelpButton({ style, testID = "help-button" }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Help"
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.8 : 1 }, style]}
      >
        <AppIcon name="help" size={18} />
        <T weight="bold" style={{ fontSize: 15 }}>Help</T>
      </Pressable>
      <HelpSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
