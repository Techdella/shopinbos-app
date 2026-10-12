import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { ChoiceRow } from "@/components/Sheet";
import { T } from "@/components/ui";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { useRole } from "@/lib/role";
import { fetchSupportTickets, openSupportWhatsApp, SUPPORT_WHATSAPP } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";

// Help (build spec 8A): chat with a person (WhatsApp when the support number is set, otherwise here in the app),
// ask Peggy, or ask us to set something up. Below, the chats with the team so far.

const STATUS: Record<string, string> = { open: "We're on it", pending: "We replied", solved: "Sorted", closed: "Closed" };

export default function Help() {
  const { role } = useRole();
  const tickets = useLoad(fetchSupportTickets);
  const list = tickets.data?.tickets ?? [];

  async function person() {
    if (await openSupportWhatsApp()) return;
    router.push("/help/chat");
  }

  return (
    <Screen title="How can we help?" refreshing={tickets.refreshing} onRefresh={() => void tickets.refresh()}>
      <ChoiceRow testID="help-person" icon="chat" tint={colors.successTint} iconColor={colors.success} title={SUPPORT_WHATSAPP ? "Chat with a person on WhatsApp" : "Chat with a person"} sub={SUPPORT_WHATSAPP ? "Our team answers on WhatsApp. English or Pidgin." : "Our team answers you here in the app."} onPress={() => void person()} />
      {!role || role === "seller" ? <ChoiceRow icon="sparkle" tint={colors.mintTint} iconColor={colors.forest} title="Ask Peggy" sub="Say what you need. She'll do it or show you how." onPress={() => router.push("/peggy")} /> : null}
      <ChoiceRow icon="settings" tint={colors.peach} iconColor={colors.accentInk} title="Ask us to set something up" sub="Web address, connecting WhatsApp or Instagram, and other hard parts." onPress={() => router.push("/ask-us")} />

      <T weight="extrabold" style={{ fontSize: 17, marginTop: 10 }} accessibilityRole="header">Your chats with our team</T>
      {tickets.loading && !tickets.data ? <LoadingBlock /> : null}
      {tickets.error && !tickets.data ? <ErrorState message={tickets.error} onRetry={() => void tickets.reload()} /> : null}
      {tickets.data && !list.length ? <EmptyState icon="chat" title="No chats yet">Tap &quot;Chat with a person&quot; and tell us what you need. We usually answer within a few hours.</EmptyState> : null}
      {list.map((ticket) => (
        <Pressable key={ticket.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/help/[number]", params: { number: String(ticket.number) } })} style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 4, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T weight={ticket.unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{ticket.subject}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{capitalise(friendlyDay(ticket.lastMessageAt))}</T>
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{ticket.preview}</T>
          <T weight="bold" style={{ fontSize: 14, color: ticket.unread ? colors.accentInk : colors.forest }}>{ticket.unread ? "New reply" : STATUS[ticket.status] ?? ""}</T>
        </Pressable>
      ))}
    </Screen>
  );
}
