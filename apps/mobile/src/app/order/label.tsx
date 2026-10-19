import { useState } from "react";
import { Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import QRCode from "react-native-qrcode-svg";
import { naira } from "@shared/onboarding";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { labelText, type LabelShop, type ShippingLabel } from "@/lib/label-pure";
import { fetchLabels, printUrl } from "@/lib/labels";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Print a label (web /home/labels): a preview of the shipping label for one order, "Print or share" (opens the
// printable page from /api/app/labels/print in the in-app browser, which shows the phone's print / share sheet)
// and "Send as text" for WhatsApp. Opened with /order/label?id=<orderId>.

type Format = "label" | "a4";

function LabelPreview({ shop, label }: { shop: LabelShop; label: ShippingLabel }) {
  const t = useT("m_label");
  const ink = "#111111";
  return (
    <View style={{ backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ink }}>
        {shop.logoUrl ? (
          <Image source={{ uri: shop.logoUrl }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="contain" />
        ) : (
          <View style={{ width: 40, height: 40, borderRadius: 8, borderWidth: 2, borderColor: ink, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 18, color: ink }}>{shop.name.charAt(0).toUpperCase()}</T>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16, color: ink }} numberOfLines={1}>{shop.name}</T>
          {shop.phone ? <T style={{ fontSize: 13, color: ink }}>{t("label.fromPhone", { phone: shop.phone })}</T> : null}
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <T weight="bold" style={{ fontSize: 12, letterSpacing: 1.4, color: ink }}>{t("label.deliverTo").toUpperCase()}</T>
        <T weight="extrabold" style={{ fontSize: 24, lineHeight: 29, color: ink }}>{label.buyerName}</T>
        {label.buyerPhone ? <T weight="bold" style={{ fontSize: 17, color: ink }}>{label.buyerPhone}</T> : null}
        <View style={{ marginTop: 6 }}>
          {label.addressLines.length ? (
            label.addressLines.map((line) => <T key={line} style={{ fontSize: 16, lineHeight: 22, color: ink }}>{line}</T>)
          ) : (
            <T style={{ fontSize: 16, fontStyle: "italic", color: ink }}>{t("label.pickup")}</T>
          )}
        </View>
      </View>

      <View style={{ borderWidth: 2, borderColor: ink, borderRadius: 8, padding: 10, alignItems: "center" }}>
        {label.collect > 0 ? (
          <T weight="extrabold" style={{ fontSize: 20, color: ink, textAlign: "center" }}>{t("label.collect", { amount: naira(label.collect) })}</T>
        ) : (
          <T weight="extrabold" style={{ fontSize: 15, color: ink, textAlign: "center" }}>{t("label.paid")}</T>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 2, borderTopColor: ink }}>
        <View style={{ flex: 1 }}>
          <T weight="bold" style={{ fontSize: 16, color: ink, fontVariant: ["tabular-nums"] }}>{label.orderNumber}</T>
          <T style={{ fontSize: 14, color: ink }}>{t("label.items", { count: label.itemCount })}</T>
        </View>
        <View accessibilityLabel={t("label.qr")}>
          <QRCode value={label.trackUrl} size={88} color={ink} backgroundColor="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

export default function LabelScreen() {
  const t = useT("m_label", "common");
  const locale = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useLoad(() => fetchLabels([id]), id);
  const answer = loaded.data;
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("label");
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    setError(null);
    try {
      // A fresh print link each time: they only last a few minutes.
      const fresh = await fetchLabels([id]);
      loaded.setData(fresh);
      if (!fresh.printToken) return setError(t("label.printOff"));
      await WebBrowser.openBrowserAsync(printUrl(fresh.printToken, format, locale));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("label.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function shareText() {
    if (!answer) return;
    const message = answer.labels.map((label) => labelText(answer.shop, label, t)).join("\n\n");
    await Share.share({ message }).catch(() => null);
  }

  if (!answer) {
    return (
      <Screen title={t("label.title")}>
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : <LoadingBlock />}
      </Screen>
    );
  }

  return (
    <Screen
      title={t("label.title")}
      sub={t("label.sub")}
      refreshing={loaded.refreshing}
      onRefresh={() => void loaded.refresh()}
      footer={
        <View style={{ gap: 6 }}>
          {error ? <Notice>{error}</Notice> : null}
          <PillButton title={t("label.print")} busy={busy} onPress={() => void print()} />
        </View>
      }
    >
      {answer.labels.map((label) => <LabelPreview key={label.orderId} shop={answer.shop} label={label} />)}

      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{t("label.paper")}</T>
        <Segmented<Format> options={[{ value: "label", label: t("label.sticker") }, { value: "a4", label: t("label.a4") }]} value={format} onChange={setFormat} />
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{format === "label" ? t("label.stickerHint") : t("label.a4Hint")}</T>
      </Card>

      <LinkButton title={t("label.sendText")} color={colors.forest} onPress={() => void shareText()} />
    </Screen>
  );
}
