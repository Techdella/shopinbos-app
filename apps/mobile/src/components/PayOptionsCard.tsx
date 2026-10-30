import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { PAY_SMALL_WEEKS, REFUND_PRESET, addDays, lagosDay, planProblem, splitIntoParts } from "@shared/instalments";
import { GROUP_DEFAULT_HOURS, GROUP_WINDOW_HOURS } from "@shared/group-buy";
import { DEFAULT_AJO_RULES, ajoWeeklyKobo } from "@shared/ajo";
import { Card, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { fetchPayOptions, savePayOptions, togetherAction, type PayOptions } from "@/lib/together";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Other ways to buy" on the phone's product screen (web: the product page's card). Pay small small, Buy with friends
// and starting an ajo group, each only while its pilot is on for this shop on this app. Every payment customers make
// goes straight to the seller's bank (their Shopinbos Wallet); without it, this says so and links to the wallet.

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? colors.ink : colors.line, justifyContent: "center" }}>
      <T weight={on ? "bold" : "regular"} style={{ fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}

export function PayOptionsCard({ productId }: { productId: string }) {
  const paySmallOn = useFeature("pay_small_small");
  const groupOn = useFeature("group_buy");
  const ajoOn = useFeature("ajo");
  const any = paySmallOn || groupOn || ajoOn;
  const t = useT("together");
  const [view, setView] = useState<PayOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [weeks, setWeeks] = useState<number[]>([...PAY_SMALL_WEEKS]);
  const [priceLock, setPriceLock] = useState(true);
  const [refundRule, setRefundRule] = useState(REFUND_PRESET);
  const [groupPrice, setGroupPrice] = useState("");
  const [groupSize, setGroupSize] = useState("5");
  const [groupHours, setGroupHours] = useState(GROUP_DEFAULT_HOURS);
  const [ajoSize, setAjoSize] = useState("6");
  const [ajoDeposit, setAjoDeposit] = useState("0");
  const [ajoStart, setAjoStart] = useState(() => addDays(lagosDay(new Date()), 7));

  function apply(loaded: PayOptions) {
    setView(loaded);
    setWeeks(loaded.option.paySmallWeeks);
    setPriceLock(loaded.option.priceLock);
    setRefundRule(loaded.option.refundRule);
    setGroupPrice(loaded.option.groupPrice !== null ? String(loaded.option.groupPrice) : "");
    setGroupSize(String(loaded.option.groupSize ?? 5));
    setGroupHours(loaded.option.groupHours ?? GROUP_DEFAULT_HOURS);
  }

  useEffect(() => {
    if (!any) return;
    let live = true;
    fetchPayOptions(productId).then((loaded) => live && apply(loaded)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [any, productId]);

  if (!any || !view) return null;

  async function save(change: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      apply(await savePayOptions(productId, change));
      setMessage({ tone: "success", text: t("saved") });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function createAjo() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await togetherAction<{ ok: true; id: string }>({ action: "ajo.create", productId, ...(view?.variants[0] ? { variantId: view.variants[0].id } : {}), size: Number(ajoSize), deposit: Number(ajoDeposit) || 0, rules: DEFAULT_AJO_RULES, startDay: ajoStart.trim() });
      setMessage({ tone: "success", text: t("ajo.created") });
      router.push({ pathname: "/ajo/[id]", params: { id: created.id } });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  const blocked = !view.walletReady ? t("walletNeeded") : view.dropship ? t("dropship") : !view.published ? t("unpublished") : null;
  const priceKobo = Math.round(view.price * 100);
  const example = weeks.find((count) => !planProblem(priceKobo, count));
  const ajoPrice = view.variants[0]?.price ?? view.price;

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <T weight="bold" style={{ fontSize: 16 }}>{t("card.title")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("card.sub")}</T>
      </View>
      {blocked ? (
        <View style={{ gap: 6 }}>
          <Notice tone="info">{blocked}</Notice>
          {!view.walletReady ? <LinkButton title={t("walletLink")} onPress={() => router.push("/wallet")} /> : null}
        </View>
      ) : null}

      {view.features.paySmall ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("small.title")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("small.sub")}</T>
            </View>
            <Toggle on={view.option.paySmallOn} label={t("small.title")} onChange={(on) => void save({ paySmallOn: on })} />
          </View>
          <Label>{t("small.weeks")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PAY_SMALL_WEEKS.map((count) => (
              <Chip key={count} on={weeks.includes(count)} label={t("small.weeksOption", { count })} onPress={() => setWeeks((current) => (current.includes(count) ? current.filter((entry) => entry !== count) : [...current, count].sort((a, b) => a - b)))} />
            ))}
          </View>
          {example ? <T weight="bold" style={{ fontSize: 14 }}>{t("small.example", { price: naira(view.price), weeks: example, weekly: naira(splitIntoParts(priceKobo, example)![0]! / 100) })}</T> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <T style={{ flex: 1, fontSize: 14.5 }}>{t("small.priceLock")}</T>
            <Toggle on={priceLock} label={t("small.priceLock")} onChange={setPriceLock} />
          </View>
          <View>
            <Label>{t("small.refund")}</Label>
            <Field value={refundRule} onChangeText={setRefundRule} multiline maxLength={500} accessibilityLabel={t("small.refund")} />
          </View>
          <LinkButton title={t("small.refundPreset")} onPress={() => setRefundRule(REFUND_PRESET)} />
          <PillButton size="md" busy={busy} title={t("save")} onPress={() => void save({ paySmallWeeks: weeks, priceLock, refundRule })} />
          <LinkButton title={t("small.seePlans")} onPress={() => router.push("/pay-small")} />
        </View>
      ) : null}

      {view.features.groupBuy ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("group.title")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("group.sub")}</T>
            </View>
            <Toggle on={view.option.groupBuyOn} label={t("group.title")} onChange={(on) => void save({ groupBuyOn: on, groupPrice: Number(groupPrice) || null, groupSize: Number(groupSize) || null, groupHours })} />
          </View>
          <View>
            <Label>{t("group.price")}</Label>
            <Field value={groupPrice} onChangeText={setGroupPrice} keyboardType="number-pad" accessibilityLabel={t("group.price")} />
          </View>
          <View>
            <Label>{t("group.size")}</Label>
            <Field value={groupSize} onChangeText={setGroupSize} keyboardType="number-pad" maxLength={2} accessibilityLabel={t("group.size")} />
          </View>
          <Label>{t("group.hours")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {GROUP_WINDOW_HOURS.map((hours) => <Chip key={hours} on={groupHours === hours} label={t("group.hoursOption", { count: hours })} onPress={() => setGroupHours(hours)} />)}
          </View>
          <PillButton size="md" busy={busy} title={t("save")} onPress={() => void save({ groupPrice: Number(groupPrice) || null, groupSize: Number(groupSize) || null, groupHours })} />
          <LinkButton title={t("group.see")} onPress={() => router.push("/group-buys")} />
        </View>
      ) : null}

      {view.features.ajo ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
          <T weight="bold" style={{ fontSize: 15 }}>{t("ajo.title")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("ajo.sub")}</T>
          <View>
            <Label>{t("ajo.size")}</Label>
            <Field value={ajoSize} onChangeText={setAjoSize} keyboardType="number-pad" maxLength={2} accessibilityLabel={t("ajo.size")} />
          </View>
          {Number(ajoSize) >= 2 ? <T weight="bold" style={{ fontSize: 14 }}>{t("ajo.weekly", { amount: naira(ajoWeeklyKobo(Math.round(ajoPrice * 100), Number(ajoSize)) / 100) })}</T> : null}
          <View>
            <Label>{t("ajo.deposit")}</Label>
            <Field value={ajoDeposit} onChangeText={setAjoDeposit} keyboardType="number-pad" accessibilityLabel={t("ajo.deposit")} />
          </View>
          <View>
            <Label>{t("ajo.start")}</Label>
            <Field value={ajoStart} onChangeText={setAjoStart} placeholder="2026-12-01" maxLength={10} accessibilityLabel={t("ajo.start")} />
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 18 }}>{DEFAULT_AJO_RULES}</T>
          <PillButton size="md" busy={busy} disabled={Boolean(blocked)} title={t("ajo.create")} onPress={() => void createAjo()} />
          <LinkButton title={t("ajo.see")} onPress={() => router.push("/ajo")} />
        </View>
      ) : null}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Card>
  );
}
