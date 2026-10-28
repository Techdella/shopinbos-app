import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { List, Row, Tile } from "@/components/design";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Mascot, PillButton, T } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { EMAIL_TABS, emailTab, openedShare, percent, type EmailTab } from "@/lib/grow-pure";
import { fetchMarketing, type CampaignRow } from "@/lib/marketing";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Email (canvas board M-Email; the web's /home/marketing/campaigns): subscribers, the average opened and the sales the
// emails brought; Sent / Scheduled / Drafts; and "+ New email", where Rex writes it (marketing/email/new.tsx). The list
// is GET /api/mobile/marketing (the same rows the Marketing screen shows). Changing an email's design is on the web.

const TAB_LABEL: Record<EmailTab, "email.sent" | "email.scheduled" | "email.drafts"> = { sent: "email.sent", scheduled: "email.scheduled", drafts: "email.drafts" };

const TAG: Record<string, { bg: string; fg: string; label: "email.tag.sent" | "email.tag.sending" | "email.tag.scheduled" | "email.tag.draft" | "email.tag.cancelled" }> = {
  sent: { bg: colors.successTint, fg: colors.success, label: "email.tag.sent" },
  sending: { bg: colors.mintTint, fg: colors.forest, label: "email.tag.sending" },
  scheduled: { bg: colors.warnTint, fg: colors.warnInk, label: "email.tag.scheduled" },
  draft: { bg: colors.canvas, fg: colors.inkSoft, label: "email.tag.draft" },
  cancelled: { bg: colors.canvas, fg: colors.inkSoft, label: "email.tag.cancelled" },
};

export default function EmailCampaigns() {
  const t = useT("m_grow", "m_ui");
  const data = useLoad(fetchMarketing);
  const [tab, setTab] = useState<EmailTab>("sent");
  const overview = data.data;
  const emails = (overview?.campaigns ?? []).filter((campaign) => campaign.channel === "email");
  const shown = emails.filter((campaign) => emailTab(campaign.status) === tab);
  const revenue = emails.reduce((sum, campaign) => sum + (campaign.revenueGenerated || 0), 0);

  const line = (campaign: CampaignRow) => {
    const now = new Date();
    if (campaign.status === "sent" || campaign.status === "sending") {
      return [campaign.sentAt ? friendlyDay(campaign.sentAt, now, t) : null, campaign.sentCount ? t("email.opened", { share: percent(campaign.openCount / campaign.sentCount) }) : null, campaign.revenueGenerated ? naira(campaign.revenueGenerated) : null].filter(Boolean).join(" · ");
    }
    if (campaign.status === "scheduled" && campaign.scheduledAt) return t("email.for", { day: friendlyDay(campaign.scheduledAt, now, t) });
    return t("email.edited", { day: friendlyDay(campaign.createdAt, now, t) });
  };

  return (
    <Screen
      title={t("email.title")}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      headerRight={<PillButton testID="email-new" size="sm" icon="plus" title={t("email.new")} onPress={() => router.push("/marketing/email/new" as never)} />}
    >
      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        <>
          <Card style={{ flexDirection: "row", gap: 8 }}>
            {[
              { key: "subscribers", label: t("email.subscribers"), value: overview.totals.subscribers.toLocaleString("en-NG") },
              { key: "opened", label: t("email.openedAvg"), value: percent(openedShare(emails)) },
              { key: "sales", label: t("email.sales"), value: naira(revenue) },
            ].map((item) => (
              <View key={item.key} testID={`email-total-${item.key}`} style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{item.label}</T>
                <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1} adjustsFontSizeToFit>{item.value}</T>
              </View>
            ))}
          </Card>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: -8 }}>{t("email.where")}</T>

          <ChipRow>
            {EMAIL_TABS.map((key) => <Chip key={key} label={t(TAB_LABEL[key])} on={tab === key} onPress={() => setTab(key)} />)}
          </ChipRow>

          {shown.length ? (
            <List>
              {shown.map((campaign) => {
                const tag = TAG[campaign.status] ?? TAG.draft;
                return <Row key={campaign.id} lead={<Tile icon="mail" tone="butter" />} title={campaign.subject || campaign.name} sub={line(campaign)} right={<Badge label={t(tag.label)} bg={tag.bg} fg={tag.fg} />} />;
              })}
            </List>
          ) : (
            <EmptyState icon="mail" title={t(tab === "sent" ? "email.noneSent" : tab === "scheduled" ? "email.noneScheduled" : "email.noDrafts")} />
          )}

          {/* Rex offers to write the next one (board M-Email). */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Mascot name="rex" size={36} label="" />
            <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 6, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
                <T style={{ fontSize: 15, lineHeight: 21 }}>{t("email.rexOffer")}</T>
              </View>
              <PillButton testID="email-rex-write" tone="white" size="md" title={t("email.rexYes")} onPress={() => router.push({ pathname: "/marketing/email/new" as never, params: { about: t("email.rexIdea") } })} />
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
