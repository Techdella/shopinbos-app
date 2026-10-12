import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { parseAmount, parseCount, productStage } from "@/lib/partner-pure";
import { fetchSupplierProduct, quickEditProduct } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Quick edits for one supplier product: stock (saves straight away, no new review), wholesale and suggested
// retail price (a live product goes back for review), and publish / hide. Everything else is on the web.

export default function SupplierProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = useLoad(() => fetchSupplierProduct(String(id)), String(id));
  const data = product.data;
  // Edits start from what's saved; null = untouched.
  const [stock, setStock] = useState<string | null>(null);
  const [wholesale, setWholesale] = useState<string | null>(null);
  const [retail, setRetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (!data) {
    return (
      <Screen title="Product" refreshing={product.refreshing} onRefresh={() => void product.refresh()}>
        {product.loading ? <LoadingBlock /> : null}
        {product.error ? <ErrorState message={product.error} onRetry={() => void product.reload()} web={{ label: "Open on web", onPress: () => void openWeb(`/supplier/products/${id}`) }} /> : null}
      </Screen>
    );
  }

  const stockText = stock ?? String(data.stockQuantity);
  const stockValue = parseCount(stockText);
  const stage = productStage(data.status);
  const hidden = ["draft", "unpublished", "rejected"].includes(data.status);

  function bump(delta: number) {
    setStock(String(Math.max(0, (stockValue ?? 0) + delta)));
  }

  async function save() {
    if (!data) return;
    const patch: { stockQuantity?: number; wholesalePrice?: number; suggestedRetailPrice?: number } = {};
    if (stock !== null) {
      if (stockValue === null) return setNotice({ tone: "error", text: "Stock must be a whole number." });
      patch.stockQuantity = stockValue;
    }
    if (wholesale !== null) {
      const value = parseAmount(wholesale);
      if (!value) return setNotice({ tone: "error", text: "Enter your wholesale price in naira." });
      patch.wholesalePrice = value;
    }
    if (retail !== null) {
      const value = parseAmount(retail);
      if (!value) return setNotice({ tone: "error", text: "Enter the suggested shop price in naira." });
      patch.suggestedRetailPrice = value;
    }
    if (!Object.keys(patch).length) return setNotice({ tone: "success", text: "Nothing changed." });
    setBusy("save");
    setNotice(null);
    try {
      const saved = await quickEditProduct(data.id, patch);
      product.setData({ ...data, ...saved });
      setStock(null);
      setWholesale(null);
      setRetail(null);
      setNotice({ tone: "success", text: saved.status === "pending_review" && data.status === "published" ? "Saved. New prices go live after a quick review." : "Saved." });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? saveError.message : "Couldn't save. Try again." });
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
      setNotice({ tone: "success", text: next ? "Sent for review. It goes live once it's approved." : "Hidden. Shops can't add it until you publish it again." });
    } catch (publishError) {
      setNotice({ tone: "error", text: publishError instanceof Error ? publishError.message : "Couldn't change that. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={data.name}
      refreshing={product.refreshing}
      onRefresh={() => void product.refresh()}
      footer={<PillButton title="Save changes" busy={busy === "save"} disabled={Boolean(busy) || (stock === null && wholesale === null && retail === null)} onPress={() => void save()} />}
    >
      {data.images.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {data.images.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 120, height: 120, borderRadius: 16, backgroundColor: colors.surface }} contentFit="cover" accessibilityLabel={data.name} />)}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TonePill tone={stage.tone} label={stage.label} />
        {data._count?.storeProducts ? <TonePill tone="muted" label={`In ${data._count.storeProducts} shops`} /> : null}
      </View>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Card style={{ gap: 10 }}>
        <Label>Stock</Label>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="One less" onPress={() => bump(-1)} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 22 }}>−</T>
          </Pressable>
          <Field value={stockText} onChangeText={(text) => setStock(text.replace(/[^\d]/g, ""))} keyboardType="number-pad" accessibilityLabel="Units in stock" style={{ flex: 1, textAlign: "center", fontSize: 20 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="One more" onPress={() => bump(1)} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="plus" size={22} strokeWidth={2.4} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[10, 50, 100].map((amount) => (
            <Pressable key={amount} accessibilityRole="button" accessibilityLabel={`Add ${amount}`} onPress={() => bump(amount)} style={{ flex: 1, minHeight: 38, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
              <T weight="bold">+{amount}</T>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <View>
          <Label>Wholesale price (₦ per unit)</Label>
          <Field value={wholesale ?? String(data.wholesalePrice)} onChangeText={setWholesale} keyboardType="decimal-pad" accessibilityLabel="Wholesale price" />
        </View>
        <View>
          <Label>Suggested shop price (₦)</Label>
          <Field value={retail ?? String(data.suggestedRetailPrice)} onChangeText={setRetail} keyboardType="decimal-pad" accessibilityLabel="Suggested shop price" />
          <T style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 6 }}>Now {naira(data.wholesalePrice)} to shops · they sell at about {naira(data.suggestedRetailPrice)}. Price changes on a live product are checked before they show.</T>
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 15 }}>{hidden ? "Not on the marketplace" : data.status === "pending_review" ? "Waiting for review" : "Live on the marketplace"}</T>
        <T style={{ color: colors.inkSoft, lineHeight: 20 }}>
          {hidden ? "Send it for review and it goes live once it's approved." : "Hide it to stop new shops adding it."}
        </T>
        <PillButton title={hidden ? "Send for review" : "Hide from marketplace"} tone={hidden ? "ink" : "white"} size="md" busy={busy === "publish"} disabled={Boolean(busy)} onPress={() => void publish(hidden)} />
      </Card>

      <LinkButton title="Edit details, tiers and regions on the web" color={colors.inkSoft} onPress={() => void openWeb(`/supplier/products/${data.id}`)} />
    </Screen>
  );
}
