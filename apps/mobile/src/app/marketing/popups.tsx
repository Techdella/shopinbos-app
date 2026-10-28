import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Mascot, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchPopups, setPopupActive } from "@/lib/grow";
import { signupRate, type PhonePopup } from "@/lib/grow-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Popups (canvas board M-Popups; the web's /home/marketing/forms): each pop-up on the shop with its switch, when it
// shows and what it asks for, and what it did in the last 30 days (seen, signed up, rate); "+ New" and a tap open the
// editor (marketing/popup/[id].tsx). Rows come from GET /api/mobile/marketing/popups; the switch is
// PATCH /api/app/marketing/forms/:id { active }. Games, downloads and countdowns are made on the web.

export function usePopupLine() {
  const t = useT("m_grow");
  return (popup: Pick<PhonePopup, "config" | "fields" | "signup">) => {
    const when =
      popup.config.trigger === "delay"
        ? t("pop.when.delay", { seconds: popup.config.delaySeconds })
        : popup.config.trigger === "exit_intent"
          ? t("pop.when.exit")
          : popup.config.trigger === "scroll"
            ? t("pop.when.scroll", { percent: popup.config.scrollPercent })
            : t("pop.when.immediate");
    if (!popup.signup) return when;
    const asks = popup.fields.some((field) => field.type === "phone") ? t("pop.asks.both") : t("pop.asks.email");
    return `${when} · ${asks}`;
  };
}

export default function Popups() {
  const t = useT("m_grow", "m_ui");
  const data = useLoad(fetchPopups);
  const line = usePopupLine();
  const [switching, setSwitching] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const overview = data.data;

  async function toggle(popup: PhonePopup, active: boolean) {
    setSwitching(popup.id);
    setProblem(null);
    try {
      await setPopupActive(popup.id, active);
      await data.reload();
    } catch (switchError) {
      setProblem(switchError instanceof Error ? switchError.message : t("pop.notSaved"));
    } finally {
      setSwitching(null);
    }
  }

  return (
    <Screen
      title={t("pop.title")}
      sub={t("pop.sub")}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      headerRight={<PillButton testID="popup-new" size="sm" icon="plus" title={t("pop.new")} onPress={() => router.push({ pathname: "/marketing/popup/[id]" as never, params: { id: "new" } })} />}
    >
      {problem ? <Notice>{problem}</Notice> : null}
      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        overview.popups.length ? (
          overview.popups.map((popup) => {
            const rate = signupRate(popup);
            return (
              <Card key={popup.id} style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Pressable
                    testID={`popup-${popup.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={popup.design.headline || popup.name}
                    onPress={() => router.push({ pathname: "/marketing/popup/[id]" as never, params: { id: popup.id } })}
                    style={{ flex: 1, minWidth: 0, gap: 3 }}
                  >
                    <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{popup.design.headline || popup.name}</T>
                    <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }} numberOfLines={2}>{line(popup)}</T>
                  </Pressable>
                  <Toggle on={popup.active} label={t("pop.show", { name: popup.design.headline || popup.name })} onChange={(next) => (switching ? undefined : void toggle(popup, next))} />
                </View>
                {popup.views > 0 ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[
                      { key: "seen", label: t("pop.seen"), value: popup.views.toLocaleString("en-NG") },
                      // A notice or sale bar collects nobody: a dash, as on the board.
                      { key: "got", label: t("pop.signedUp"), value: popup.signup ? popup.signups.toLocaleString("en-NG") : "–" },
                      { key: "rate", label: t("pop.rate"), value: popup.signup ? (rate ?? "–") : "–" },
                    ].map((item) => (
                      <View key={item.key} style={{ flex: 1, minWidth: 0, backgroundColor: colors.canvas, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
                        <T style={{ fontSize: 12.5, color: colors.inkSoft }} numberOfLines={1}>{item.label}</T>
                        <T weight="extrabold" style={{ fontSize: 16 }}>{item.value}</T>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })
        ) : (
          <EmptyState icon="popup" title={t("pop.none")} action={<PillButton size="sm" title={t("pop.makeFirst")} onPress={() => router.push({ pathname: "/marketing/popup/[id]" as never, params: { id: "new" } })} />}>
            {t("pop.noneBody")}
          </EmptyState>
        )
      ) : null}

      {/* Rex's tip (board M-Popups): a WhatsApp number often gets more sign-ups than an email alone. */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Mascot name="rex" size={36} label="" />
        <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 6, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
          <T style={{ fontSize: 15, lineHeight: 21 }}>{t("pop.rexTip")}</T>
        </View>
      </View>
    </Screen>
  );
}
