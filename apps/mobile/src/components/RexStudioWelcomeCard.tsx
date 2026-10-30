import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Mascot, T } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { fetchRexStudioWelcome, type RexStudioWelcome } from "@/lib/rex-studio";
import { formatDate } from "@shared/i18n";
import { REX_STUDIO_STARTERS, type RexStudioStarterId } from "@shared/rex-studio-welcome";
import { colors, radii } from "@/theme";

// "You have 20 credits to try Rex Studio" on the phone (rules in shared/rex-studio-welcome.ts), on the "is live"
// screen and Home: three one-tap starters that open Rex with the request (app/rex.tsx ?prompt=), a credits meter, and
// when the credits run low or out the app's usual calm words: the plan's credits refill each month. Never a price,
// a link or a button to buy (Apple 3.1.1 / Google Play payments, shared/store-payments.ts). Hidden when the server
// says there's no card (paid plan, no welcome, or over 30 days).

const ICON: Record<RexStudioStarterId, AppIconName> = { video: "video", photos: "image", flyer: "megaphone" };

/** `compact`: the "is live" screen, where the shop preview needs the room (no intro line, one line per starter). */
export function RexStudioWelcomeCard({ onStart, compact = false }: { onStart?: (prompt: string) => void; compact?: boolean }) {
  const t = useT("m_credits");
  const locale = useLocale();
  const [view, setView] = useState<RexStudioWelcome | null>(null);
  const load = useCallback(() => {
    void fetchRexStudioWelcome().then(setView);
  }, []);
  // On every visit (and back from Rex): the meter shows what's left.
  useFocusEffect(load);
  if (!view) return null;

  const starter = (id: RexStudioStarterId) => {
    const product = view.product;
    if (id === "video") return { label: product ? t("rs.starter.video", { product }) : t("rs.starter.videoShop"), prompt: product ? t("rs.prompt.video", { product }) : t("rs.prompt.videoShop"), cost: t("rs.costFrom", { count: view.costs.video }) };
    if (id === "photos") return { label: product ? t("rs.starter.photos", { product }) : t("rs.starter.photosShop"), prompt: product ? t("rs.prompt.photos", { product }) : t("rs.prompt.photosShop"), cost: t("rs.costEach", { count: view.costs.photo }) };
    return { label: t("rs.starter.flyer"), prompt: t("rs.prompt.flyer"), cost: t("rs.costFrom", { count: view.costs.image }) };
  };
  const start = (prompt: string) => (onStart ? onStart(prompt) : router.push({ pathname: "/rex", params: { prompt } }));
  const bar = view.state === "plenty" ? colors.mintTint : view.state === "low" ? "#F2A93B" : "#E86A4F";

  return (
    <View testID="rex-studio-welcome" style={{ backgroundColor: colors.inkFill, borderRadius: 24, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mascot who="rex" mood="wave" size={52} label="" />
        <View style={{ flex: 1 }}>
          <T weight="bold" style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1.6 }}>{t("rs.eyebrow").toUpperCase()}</T>
          <T weight="extrabold" accessibilityRole="header" style={{ color: "#FFFFFF", fontSize: 18, lineHeight: 23 }}>{t("rs.title", { count: view.balance })}</T>
          {compact ? null : <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 19 }}>{t("rs.sub")}</T>}
        </View>
      </View>

      <View accessible accessibilityRole="progressbar" accessibilityLabel={t("rs.meter", { count: view.balance, target: view.target })} accessibilityValue={{ min: 0, max: view.target, now: Math.min(view.balance, view.target) }} style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <T weight="bold" style={{ color: "#FFFFFF", fontSize: 13 }}>{t("rs.meter", { count: view.balance, target: view.target })}</T>
          {view.expiresAt && view.granted > 0 ? <T style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5 }}>{t("rs.expires", { date: formatDate(new Date(view.expiresAt), locale, { day: "numeric", month: "long" }) })}</T> : null}
        </View>
        <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
          <View style={{ width: `${view.percent}%`, height: 8, borderRadius: radii.pill, backgroundColor: bar }} />
        </View>
      </View>

      {view.state === "plenty" ? (
        <View style={{ gap: 8 }}>
          {REX_STUDIO_STARTERS.map((id) => {
            const item = starter(id);
            return (
              <Pressable key={id} testID={`rex-studio-starter-${id}`} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => start(item.prompt)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: compact ? 44 : 56, borderRadius: 16, paddingHorizontal: 14, paddingVertical: compact ? 6 : 8, backgroundColor: "rgba(255,255,255,0.1)", opacity: pressed ? 0.85 : 1 })}>
                <AppIcon name={ICON[id]} size={18} color="#FFFFFF" />
                <View style={{ flex: 1 }}>
                  <T weight="extrabold" numberOfLines={compact ? 1 : 2} style={{ color: "#FFFFFF", fontSize: 14.5 }}>{item.label}</T>
                  {compact ? null : <T style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5 }}>{item.cost}</T>}
                </View>
                <AppIcon name="chevron" size={16} color="rgba(255,255,255,0.7)" />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View accessibilityLiveRegion="polite" style={{ borderRadius: 16, padding: 14, gap: 4, backgroundColor: "rgba(255,255,255,0.1)" }}>
          <T weight="bold" style={{ color: "#FFFFFF", fontSize: 14.5 }}>{view.state === "out" ? t("rs.out") : t("rs.low")}</T>
          <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 13.5 }}>{t("rs.outApp")}</T>
        </View>
      )}
    </View>
  );
}
