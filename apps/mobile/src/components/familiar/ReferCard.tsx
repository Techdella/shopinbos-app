import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { formatDate } from "@shared/i18n";
import { Eyebrow, Heading, List, Pill, Row, type PillTone } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { T } from "@/components/ui";
import { fetchReferrals, type ReferralRole } from "@/lib/referrals";
import { shareText } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Refer & earn on Rewards (the web's Refer & earn page, GET /api/mobile/referrals): your invite link with Copy and
// Share, what you get for each kind of business (free months or AI credits, never cash), what you've earned, and
// the businesses that joined with your link and how far they are. Hidden when the server doesn't answer.

const STATUS_TONE: Record<string, PillTone> = { signed_up: "warn", qualified: "teal", rewarded: "ok", rejected: "gray" };
const ROLE_ICON: Record<ReferralRole, AppIconName> = { supplier: "box", seller: "store", logistics_partner: "truck" };

function DarkButton({ icon, label, onPress, primary }: { icon: AppIconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 46, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: primary ? "#73D8C8" : "rgba(255,255,255,0.12)", opacity: pressed ? 0.85 : 1 })}
    >
      <AppIcon name={icon} size={18} color={primary ? colors.ink : "#FFFFFF"} />
      <T weight="bold" style={{ fontSize: 15.5, color: primary ? colors.ink : "#FFFFFF" }}>{label}</T>
    </Pressable>
  );
}

export function ReferCard() {
  const t = useT("m_familiar");
  const locale = useLocale();
  const referrals = useLoad(fetchReferrals);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const data = referrals.data;
  if (!data) return null;

  const copy = async () => {
    await Clipboard.setStringAsync(data.link).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  const share = () => void shareText(t("ref.shareMessage", { link: data.link }));
  const earned = data.earned.months > 0 || data.earned.credits > 0;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 20, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase", color: "#73D8C8" }}>{t("ref.eyebrow")}</T>
          <Heading style={{ color: "#FFFFFF" }}>{t("ref.title")}</Heading>
        </View>

        <View style={{ gap: 8 }}>
          {data.offers.map((offer) => (
            <View key={offer.role} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name={ROLE_ICON[offer.role] ?? "users"} size={18} color="#73D8C8" />
              <T style={{ flex: 1, fontSize: 14.5, lineHeight: 20, color: "rgba(255,255,255,0.86)" }}>
                {t.dynamic(`ref.offer.${offer.role}`, offer.role, { months: offer.months, credits: offer.credits })}
              </T>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
          <T selectable style={{ fontSize: 14.5, color: "#FFFFFF" }} numberOfLines={1} accessibilityLabel={t("ref.linkLabel", { link: data.link })}>
            {data.link.replace(/^https?:\/\//, "")}
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <DarkButton icon={copied ? "check" : "link"} label={copied ? t("ref.copied") : t("ref.copy")} onPress={() => void copy()} />
          <DarkButton icon="share" label={t("ref.share")} onPress={share} primary />
        </View>

        <T weight="semibold" style={{ fontSize: 13.5, lineHeight: 19, color: "rgba(255,255,255,0.62)" }}>
          {earned ? t("ref.earned", { months: data.earned.months, credits: data.earned.credits }) : t("ref.noCash")}
          {data.freeUntil ? ` ${t("ref.freeUntil", { date: formatDate(data.freeUntil, locale, { day: "numeric", month: "short", year: "numeric" }) })}` : ""}
        </T>
      </View>

      {data.referrals.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Eyebrow>{t("ref.invited")}</Eyebrow>
            <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("ref.counts", { joined: data.counts.joined, rewarded: data.counts.rewarded })}</T>
          </View>
          <List>
            {data.referrals.slice(0, 5).map((referral) => (
              <Row
                key={referral.id}
                lead={<Picture uri={referral.avatarUrl} name={referral.name} size={40} />}
                title={referral.name}
                sub={`${t.dynamic(`ref.role.${referral.role}`, referral.role)} · ${t("ref.joined", { date: formatDate(referral.joinedAt, locale, { day: "numeric", month: "short" }) })}`}
                right={<Pill label={t.dynamic(`ref.status.${referral.status}`, referral.status)} tone={STATUS_TONE[referral.status] ?? "gray"} />}
              />
            ))}
          </List>
        </View>
      ) : null}
    </View>
  );
}
