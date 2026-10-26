import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { Heading, List, Pill, Row, Stepper, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { parseAmount, productStage } from "@/lib/partner-pure";
import { fetchSupplierProduct, quickEditProduct } from "@/lib/supplier";
import { bestWholesale, LOW_STOCK } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// One supplier product ("Simple app, end to end" supplier prototype): the photo, name and price to shops, "In stock"
// with − / + (saved a moment after the last tap; no new review), and rows for the wholesale price (tap to change the
// price; a live product goes back for review) and dropship. Below: show it to shops or hide it, and the full editor
// (supplier/product/edit: photos, details, price tiers, regions, dropship).

const SAVE_AFTER_MS = 700;

export default function SupplierProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_supplier", "m_partner");
  const product = useLoad(() => fetchSupplierProduct(String(id)), String(id));
  const data = product.data;
  const [editing, setEditing] = useState(false);
  const [wholesale, setWholesale] = useState<string | null>(null);
  const [retail, setRetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Back from the editor: show what was saved.
  const reload = useRef(product.reload);
  useEffect(() => {
    reload.current = product.reload;
  });
  const shown = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (shown.current) void reload.current();
      shown.current = true;
    }, []),
  );

  if (!data) {
    return (
      <Screen title={t("product.title")} refreshing={product.refreshing} onRefresh={() => void product.refresh()}>
        {product.loading ? <LoadingBlock /> : null}
        {product.error ? <ErrorState message={product.error} onRetry={() => void product.reload()} /> : null}
      </Screen>
    );
  }

  const stage = productStage(data.status, t);
  const hidden = ["draft", "unpublished", "rejected"].includes(data.status);
  const deal = bestWholesale(data);
  const stock = data.stockQuantity;

  function changeStock(next: number) {
    if (!data) return;
    product.setData({ ...data, stockQuantity: next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      quickEditProduct(data.id, { stockQuantity: next })
        .then(() => setNotice(null))
        .catch((saveError) => {
          setNotice({ tone: "error", text: saveError instanceof Error ? saveError.message : t("product.saveFailed") });
          void product.reload();
        });
    }, SAVE_AFTER_MS);
  }

  async function savePrices() {
    if (!data) return;
    const patch: { wholesalePrice?: number; suggestedRetailPrice?: number } = {};
    if (wholesale !== null) {
      const value = parseAmount(wholesale);
      if (!value) return setNotice({ tone: "error", text: t("product.needWholesale") });
      patch.wholesalePrice = value;
    }
    if (retail !== null) {
      const value = parseAmount(retail);
      if (!value) return setNotice({ tone: "error", text: t("product.needRetail") });
      patch.suggestedRetailPrice = value;
    }
    if (!Object.keys(patch).length) {
      setEditing(false);
      return setNotice({ tone: "success", text: t("product.nothingChanged") });
    }
    setBusy("save");
    setNotice(null);
    try {
      const saved = await quickEditProduct(data.id, patch);
      product.setData({ ...data, ...saved });
      setWholesale(null);
      setRetail(null);
      setEditing(false);
      setNotice({ tone: "success", text: saved.status === "pending_review" && data.status === "published" ? t("product.savedReview") : t("product.saved") });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? saveError.message : t("product.saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function publish(next: boolean) {
    if (!data) return;
    setBusy("publish");
    setNotice(null);
    try {
      const saved = await quickEditProduct(data.id, { publish: next });
      product.setData({ ...data, ...saved });
      setNotice({ tone: "success", text: next ? t("product.sent") : t("product.hiddenNow") });
    } catch (publishError) {
      setNotice({ tone: "error", text: publishError instanceof Error ? publishError.message : t("product.changeFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={t("product.title")}
      refreshing={product.refreshing}
      onRefresh={() => void product.refresh()}
      footer={editing ? <PillButton title={t("product.save")} tone="accent" busy={busy === "save"} disabled={Boolean(busy)} onPress={() => void savePrices()} /> : undefined}
    >
      {data.images.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {data.images.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 280, height: 240, borderRadius: 24, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={data.name} />)}
        </ScrollView>
      ) : data.images[0] ? (
        <Image source={{ uri: data.images[0] }} style={{ width: "100%", height: 240, borderRadius: 24, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={data.name} />
      ) : null}

      <View style={{ gap: 6 }}>
        <Heading>{data.name}</Heading>
        <Sub>{t("products.toShops", { price: naira(data.wholesalePrice) })}</Sub>
        {data.status === "published" ? null : <Pill label={stage.label} tone={data.status === "pending_review" ? "warn" : "gray"} />}
      </View>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <T weight="bold" style={{ fontSize: 16 }}>{t("product.inStockTitle")}</T>
          <T style={{ fontSize: 14, color: stock <= LOW_STOCK ? colors.warnInk : colors.inkSoft }}>{stock <= LOW_STOCK ? t("products.runningLow", { count: stock }) : t("products.inStock", { count: stock })}</T>
        </View>
        <Stepper value={stock} onChange={changeStock} label={t("unitsInStock")} max={10_000_000} />
      </View>

      <List>
        <Row
          lead={<Tile icon="coin" tone="gray" />}
          title={t("product.wholesale")}
          sub={t("product.eachFor", { price: naira(deal.price), count: deal.minQty })}
          onPress={() => setEditing((open) => !open)}
        />
        <Row
          lead={<Tile icon="truck" tone="gray" />}
          title={t("kind.dropship")}
          sub={data.dropshipAvailable ? t("product.dropshipOn") : t("product.dropshipOff")}
          onPress={() => router.push({ pathname: "/supplier/product/edit", params: { id: data.id } })}
        />
      </List>

      {editing ? (
        <View style={{ gap: 12 }}>
          <View>
            <Label>{t("product.wholesalePerUnit")}</Label>
            <Field value={wholesale ?? String(data.wholesalePrice)} onChangeText={setWholesale} keyboardType="decimal-pad" accessibilityLabel={t("product.wholesale")} />
          </View>
          <View>
            <Label>{t("product.retail")}</Label>
            <Field value={retail ?? String(data.suggestedRetailPrice)} onChangeText={setRetail} keyboardType="decimal-pad" accessibilityLabel={t("suggestedRetail")} />
            <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6, lineHeight: 20 }}>{t("product.now", { wholesale: naira(data.wholesalePrice), retail: naira(data.suggestedRetailPrice) })}</T>
          </View>
          <LinkButton title={t("money.tiers")} color={colors.inkSoft} onPress={() => router.push({ pathname: "/supplier/product/edit", params: { id: data.id, focus: "tiers" } })} />
        </View>
      ) : null}

      <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 10 }}>
        <T weight="bold" style={{ fontSize: 16 }}>{hidden ? t("product.notListed") : data.status === "pending_review" ? t("product.inReview") : t("product.listed")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{hidden ? t("product.showHint") : t("product.hideHint")}</T>
        <PillButton title={hidden ? t("showToShops") : t("product.hide")} tone="white" size="md" busy={busy === "publish"} disabled={Boolean(busy)} onPress={() => void publish(hidden)} />
      </View>

      <LinkButton title={t("product.editAll")} color={colors.inkSoft} onPress={() => router.push({ pathname: "/supplier/product/edit", params: { id: data.id } })} />
    </Screen>
  );
}
