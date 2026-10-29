import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Badge } from "@/components/kit";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { colors, themed } from "@/theme";

// Pieces the Ads screens share (app/ads): money in the campaign's currency, the status badge and the numbers.

export function adMoney(value: number, currency = "NGN") {
  return currency === "NGN" ? naira(Math.round(value)) : `${Math.round(value * 100) / 100} ${currency}`;
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = themed(() => ({
  running: { bg: colors.successTint, fg: colors.success },
  paused: { bg: "#FDF0D5", fg: "#8A5A00" },
  draft: { bg: colors.canvas, fg: colors.inkSoft },
  ended: { bg: colors.canvas, fg: colors.inkSoft },
}));

export function AdStatusBadge({ status }: { status: string }) {
  const t = useT("ads");
  const tone = STATUS_TONE[status] ?? STATUS_TONE.draft;
  return <Badge label={t.dynamic(`status.${status}`, status)} bg={tone.bg} fg={tone.fg} />;
}

/** "Facebook & Instagram", "TikTok, run by Shopinbos"… for a campaign. */
export function useModeLabel() {
  const t = useT("ads");
  return (campaign: { mode: string; platform: string }) => (campaign.mode === "meta" ? t("c.onMeta") : campaign.platform === "tiktok" ? t("c.byTeamTiktok") : t("c.byTeamMeta"));
}

const PLATFORM_NAME: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", meta: "Facebook & Instagram" };

/** Where a "boost it yourself" ad runs. */
export function usePlatformName() {
  const t = useT("ads");
  return (platform: string) => (platform === "whatsapp_status" ? t("platform.whatsappStatus") : PLATFORM_NAME[platform] ?? platform);
}

/** Number tiles, two to a row. */
export function StatTiles({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexGrow: 1, flexBasis: "45%", backgroundColor: colors.canvas, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
          <T style={{ fontSize: 13, color: colors.inkSoft }}>{item.label}</T>
          <T weight="extrabold" style={{ fontSize: 16 }}>{item.value}</T>
        </View>
      ))}
    </View>
  );
}
