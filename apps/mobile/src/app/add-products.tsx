import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { Eyebrow, List, Row, Sub, Tile, Title } from "@/components/design";
import { Screen } from "@/components/Screen";
import { Thumb } from "@/components/seller/bits";
import { ShareProductButton, ShareProductIcon } from "@/components/seller/ProductCode";
import { Mascot, Notice, PillButton } from "@/components/ui";
import { ProductDraftsCard, useProductDrafts } from "@/components/ProductDrafts";
import { fetchProducts, type ProductItem } from "@/lib/dashboard";
import { useT } from "@/lib/i18n";

// The orange "+" button ("Familiar app" prototype `on.add`): snap or pick photos, Rex names and prices them, they go
// straight into the shop. Before any photo: a camera tile, "Take a photo of it", two short tips and the last few
// products added (hidden when there are none or they don't load).

const RECENT = 3;

export default function AddProducts() {
  const t = useT("m_products", "common");
  const drafts = useProductDrafts();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const [recent, setRecent] = useState<ProductItem[]>([]);
  const count = drafts.drafts.length;

  useEffect(() => {
    let alive = true;
    fetchProducts()
      .then((list) => alive && setRecent(list.slice(0, RECENT)))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [saved]);

  async function save() {
    setBusy(true);
    drafts.setError(null);
    try {
      if (await drafts.save()) setSaved((total) => total + count);
    } catch (saveError) {
      drafts.setError(saveError instanceof Error ? saveError.message : t("add.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t("add.title")}
      fallback="/home"
      footer={
        <>
          {drafts.error ? <Notice>{drafts.error}</Notice> : null}
          {count > 0 ? (
            <PillButton title={t("add.put", { count })} busy={busy} disabled={drafts.reading} onPress={() => void save()} />
          ) : (
            <PillButton title={t("done")} tone="white" onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
          )}
        </>
      }
    >
      {count === 0 ? (
        <View style={{ alignItems: "center", gap: 12, paddingTop: 8 }}>
          <Tile icon="camera" tone="peach" size={88} />
          <Title size={28} style={{ textAlign: "center" }}>{t("add.photoTitle")}</Title>
          <Sub style={{ textAlign: "center" }}>{t("add.photoSub")}</Sub>
        </View>
      ) : null}
      {saved > 0 ? <Notice tone="success">{t("add.saved", { count: saved })}</Notice> : null}
      {/* Just added: share the newest one on WhatsApp straight away. */}
      {saved > 0 && recent[0]?.status === "published" && recent[0].url ? <ShareProductButton product={recent[0]} /> : null}
      <ProductDraftsCard state={drafts} />

      {count === 0 ? (
        <List>
          <Row lead={<Tile icon="image" tone="butter" />} title={t("add.tip1")} sub={t("add.tip1Sub")} />
          <Row lead={<Mascot name="rex" size={44} label="" />} title={t("add.tip2")} sub={t("add.tip2Sub")} />
        </List>
      ) : null}

      {count === 0 && recent.length ? (
        <View style={{ gap: 10 }} testID="add-recent">
          <Eyebrow>{t("add.recent")}</Eyebrow>
          <List>
            {recent.map((product) => (
              <Row
                key={product.id}
                lead={<Thumb uri={product.images[0]} size={44} radius={12} fallback={product.name} />}
                title={product.name}
                sub={naira(product.retailPrice)}
                right={product.status === "published" && product.url ? <ShareProductIcon product={product} /> : undefined}
                onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
              />
            ))}
          </List>
        </View>
      ) : null}
    </Screen>
  );
}
