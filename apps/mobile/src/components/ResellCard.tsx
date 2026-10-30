import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { RESELL_PCT_DEFAULT, cleanResellPct, resellCommission } from "@shared/resell";
import { Card, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { fetchProductResell, saveProductResell, type ProductResell } from "@/lib/resell";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Let resellers sell this" on the phone's product screen (web: the product page's resell card). Only while the
// "resell" pilot is on for this shop on this app. The switch saves at once; the commission (1–50%) with Save.
// The shop owes the commission on sales through a reseller's link; Shopinbos only records it.

export function ResellCard({ productId, price }: { productId: string; price: number }) {
  const on = useFeature("resell");
  const t = useT("resell");
  const [setting, setSetting] = useState<ProductResell | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pct, setPct] = useState(String(RESELL_PCT_DEFAULT));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!on) return;
    let live = true;
    fetchProductResell(productId)
      .then((loaded) => {
        if (!live) return;
        setSetting(loaded);
        setEnabled(loaded.enabled);
        setPct(String(loaded.commissionPct));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [on, productId]);

  if (!on || !setting) return null;

  async function save(next: { enabled: boolean; pct: string }) {
    const commissionPct = cleanResellPct(next.pct);
    if (commissionPct === null) {
      setMessage({ tone: "error", text: t("switch.badPct") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveProductResell(productId, { enabled: next.enabled, commissionPct });
      setSetting(saved);
      setEnabled(saved.enabled);
      setPct(String(saved.commissionPct));
      setMessage({ tone: "success", text: t("switch.saved") });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("switch.failed") });
    } finally {
      setBusy(false);
    }
  }

  const typed = cleanResellPct(pct);
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="bold" style={{ fontSize: 16 }}>{t("switch.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("switch.sub")}</T>
        </View>
        <Toggle on={enabled} label={t("switch.title")} onChange={(next) => { setEnabled(next); void save({ enabled: next, pct }); }} />
      </View>
      <View>
        <Label>{t("switch.commission")}</Label>
        <Field value={pct} onChangeText={setPct} keyboardType="decimal-pad" maxLength={5} accessibilityLabel={t("switch.commission")} />
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("switch.commissionHint")}</T>
      {typed !== null && price > 0 ? <T weight="bold" style={{ fontSize: 14.5 }}>{t("switch.example", { price: naira(price), amount: naira(resellCommission(price, typed)) })}</T> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <PillButton title={t("switch.save")} tone="white" size="md" busy={busy} onPress={() => void save({ enabled, pct })} />
      <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("switch.links", { count: setting.links })}</T>
      <LinkButton title={t("switch.seeSales")} onPress={() => router.push("/resell-sales")} />
    </Card>
  );
}
