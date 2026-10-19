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
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Help (build spec 8A): chat with a person (WhatsApp when the support number is set, otherwise here in the app),
// ask Peggy, or ask us to set something up. Below, the chats with the team so far.

// m_help keys
const STATUS: Record<string, "ticket.open" | "ticket.pending" | "ticket.solved" | "ticket.closed"> = { open: "ticket.open", pending: "ticket.pending", solved: "ticket.solved", closed: "ticket.closed" };

export default function Help() {
  const t = useT("m_help", "m_ui");
  const { role } = useRole();
  const tickets = useLoad(fetchSupportTickets);
  const list = tickets.data?.tickets ?? [];

  async function person() {
    if (await openSupportWhatsApp()) return;
    router.push("/help/chat");
  }

  return (
    <Screen title={t("sheet.title")} refreshing={tickets.refreshing} onRefresh={() => void tickets.refresh()}>
      <ChoiceRow testID="help-person" icon="chat" tint={colors.successTint} iconColor={colors.success} title={SUPPORT_WHATSAPP ? t("sheet.personWhatsApp") : t("sheet.person")} sub={SUPPORT_WHATSAPP ? t("sheet.personWhatsAppSub") : t("sheet.personAppSub")} onPress={() => void person()} />
      {!role || role === "seller" ? <ChoiceRow icon="sparkle" tint={colors.mintTint} iconColor={colors.forest} title={t("sheet.askPeggy")} sub={t("sheet.askPeggySub")} onPress={() => router.push("/peggy")} /> : null}
      <ChoiceRow icon="settings" tint={colors.peach} iconColor={colors.accentInk} title={t("sheet.askUs")} sub={t("help.askUsSub")} onPress={() => router.push("/ask-us")} />

      <T weight="extrabold" style={{ fontSize: 17, marginTop: 10 }} accessibilityRole="header">{t("help.yourChats")}</T>
      {tickets.loading && !tickets.data ? <LoadingBlock /> : null}
      {tickets.error && !tickets.data ? <ErrorState message={tickets.error} onRetry={() => void tickets.reload()} /> : null}
      {tickets.data && !list.length ? <EmptyState icon="chat" title={t("help.emptyTitle")}>{t("help.emptyBody")}</EmptyState> : null}
      {list.map((ticket) => (
        <Pressable key={ticket.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/help/[number]", params: { number: String(ticket.number) } })} style={({ pressed }) => ({ backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 4, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T weight={ticket.unread ? "extrabold" : "bold"} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>{ticket.subject}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{capitalise(friendlyDay(ticket.lastMessageAt, new Date(), t))}</T>
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{ticket.preview}</T>
          <T weight="bold" style={{ fontSize: 14, color: ticket.unread ? colors.accentInk : colors.forest }}>{ticket.unread ? t("ticket.newReply") : STATUS[ticket.status] ? t(STATUS[ticket.status]) : ""}</T>
        </Pressable>
      ))}
    </Screen>
  );
}
