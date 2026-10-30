import { useState } from "react";
import { Image, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { List, Row, Tile } from "@/components/design";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { WebBadge } from "@/components/WebBadge";
import { Field, Label, LinkButton, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { fetchPublishedProducts } from "@/lib/paylinks";
import {
  addToCollection,
  createProductCollection,
  fetchContentCollections,
  fetchProductCollection,
  fetchProductCollections,
  fetchStorePages,
  removeFromCollection,
  saveProductCollection,
  saveStorePage,
  type ProductCollectionDetail,
  type StorePageRow,
} from "@/lib/store-pages";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Store pages on the phone (web /home/pages, /home/collections, /home/cms): the shop's pages (rename, show or hide,
// search words), product collections (new, rename, add and take out products) and content collections (blog,
// FAQ…). Page layouts and content items are easier on a bigger screen: each part has a button to the web page.

type Tab = "pages" | "collections" | "content";

export default function StorePages() {
  const t = useT("m_shop");
  const [tab, setTab] = useState<Tab>("pages");
  return (
    <Screen title={t("pages.title")} sub={t("pages.sub")}>
      <Segmented
        options={[
          { value: "pages", label: t("pages.tab.pages") },
          { value: "collections", label: t("pages.tab.collections") },
          { value: "content", label: t("pages.tab.content") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "pages" ? <Pages /> : tab === "collections" ? <Collections /> : <Content />}
    </Screen>
  );
}

function WebRow({ title, sub, path }: { title: string; sub: string; path: string }) {
  return (
    <List>
      <Row lead={<Tile icon="globe" tone="sky" />} title={title} sub={sub} right={<WebBadge />} onPress={() => void openWeb(path)} />
    </List>
  );
}

function Pages() {
  const t = useT("m_shop");
  const pages = useLoad(fetchStorePages);
  const [editing, setEditing] = useState<StorePageRow | null>(null);
  const [form, setForm] = useState({ title: "", live: true, metaTitle: "", metaDescription: "" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function open(page: StorePageRow) {
    setEditing(page);
    setProblem(null);
    setForm({ title: page.title, live: page.status === "published", metaTitle: page.draftContent?.seo?.metaTitle ?? "", metaDescription: page.draftContent?.seo?.metaDescription ?? "" });
  }

  async function save() {
    if (!editing) return;
    if (!form.title.trim()) return setProblem(t("pages.needTitle"));
    setBusy(true);
    try {
      await saveStorePage(editing.id, { title: form.title.trim(), status: form.live ? "published" : "hidden", seo: { metaTitle: form.metaTitle.trim(), metaDescription: form.metaDescription.trim() } });
      setEditing(null);
      void pages.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("pages.couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {pages.loading && !pages.data ? <LoadingBlock /> : null}
      {pages.error ? <ErrorState message={pages.error} onRetry={() => void pages.reload()} /> : null}
      {pages.data && !pages.data.length ? <EmptyState icon="doc" title={t("pages.none")} /> : null}
      {pages.data?.length ? (
        <List>
          {pages.data.map((page) => (
            <Row key={page.id} lead={<Tile icon="doc" tone={page.status === "published" ? "mint" : "gray"} />} title={page.title} sub={`/${page.slug} · ${page.status === "published" ? t("pages.live") : t("pages.hidden")}`} onPress={() => open(page)} chevron />
          ))}
        </List>
      ) : null}
      <WebRow title={t("pages.web")} sub={t("pages.webSub")} path="/home/pages" />

      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title={t("pages.edit")}>
        <View>
          <Label>{t("pages.name")}</Label>
          <Field value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} maxLength={120} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ fontSize: 15.5 }}>{t("pages.showIt")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("pages.showItHint")}</T>
          </View>
          <Toggle on={form.live} onChange={(live) => setForm((current) => ({ ...current, live }))} label={t("pages.showIt")} />
        </View>
        <View>
          <Label>{t("pages.searchTitle")}</Label>
          <Field value={form.metaTitle} onChangeText={(metaTitle) => setForm((current) => ({ ...current, metaTitle }))} maxLength={70} />
        </View>
        <View>
          <Label>{t("pages.searchLine")}</Label>
          <Field value={form.metaDescription} onChangeText={(metaDescription) => setForm((current) => ({ ...current, metaDescription }))} maxLength={160} multiline style={{ height: 80, paddingTop: 12, textAlignVertical: "top" }} />
        </View>
        {problem ? <Notice>{problem}</Notice> : null}
        <PillButton title={t("pages.save")} busy={busy} onPress={() => void save()} />
        {editing ? (
          <List>
            <Row lead={<Tile icon="globe" tone="sky" />} title={t("pages.layoutOnWeb")} right={<WebBadge />} onPress={() => void openWeb(`/home/pages/${editing.id}`)} />
          </List>
        ) : null}
      </Sheet>
    </>
  );
}

function Collections() {
  const t = useT("m_shop");
  const list = useLoad(fetchProductCollections);
  const products = useLoad(fetchPublishedProducts);
  const [open, setOpen] = useState<ProductCollectionDetail | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function show(id: string) {
    setProblem(null);
    try {
      const detail = await fetchProductCollection(id);
      setOpen(detail);
      setForm({ name: detail.name, description: detail.description ?? "" });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("pages.couldNotSave"));
    }
  }

  async function run(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      after?.();
      void list.reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("pages.couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {list.loading && !list.data ? <LoadingBlock /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.data && !list.data.length ? <EmptyState icon="grid" title={t("col.none")} /> : null}
      {list.data?.length ? (
        <List>
          {list.data.map((collection) => (
            <Row key={collection.id} lead={<Tile icon="grid" tone="lilac" />} title={collection.name} sub={t("col.count", { count: collection.productCount })} onPress={() => void show(collection.id)} chevron />
          ))}
        </List>
      ) : null}
      {problem && !open ? <Notice>{problem}</Notice> : null}
      <PillButton tone="white" icon="plus" title={t("col.new")} onPress={() => { setNewName(""); setProblem(null); setCreating(true); }} />
      <WebRow title={t("col.web")} sub={t("col.webSub")} path="/home/collections" />

      <Sheet visible={creating} onClose={() => setCreating(false)} title={t("col.new")}>
        <View>
          <Label>{t("col.name")}</Label>
          <Field value={newName} onChangeText={setNewName} maxLength={120} placeholder={t("col.namePlaceholder")} />
        </View>
        {problem ? <Notice>{problem}</Notice> : null}
        <PillButton title={t("col.create")} busy={busy} disabled={!newName.trim()} onPress={() => void run(() => createProductCollection(newName), () => setCreating(false))} />
      </Sheet>

      <Sheet visible={Boolean(open)} onClose={() => setOpen(null)} title={open?.name ?? ""}>
        <View>
          <Label>{t("col.name")}</Label>
          <Field value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} maxLength={120} />
        </View>
        <View>
          <Label>{t("col.description")}</Label>
          <Field value={form.description} onChangeText={(description) => setForm((current) => ({ ...current, description }))} maxLength={2000} multiline style={{ height: 80, paddingTop: 12, textAlignVertical: "top" }} />
        </View>
        <PillButton title={t("pages.save")} busy={busy} disabled={!form.name.trim()} onPress={() => open && void run(() => saveProductCollection(open.id, { name: form.name.trim(), description: form.description.trim() }))} />
        <T weight="extrabold" style={{ fontSize: 16, marginTop: 6 }}>{t("col.products")}</T>
        {open?.products.length ? (
          <List>
            {open.products.map(({ product }) => (
              <Row
                key={product.id}
                lead={product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: 44, height: 44, borderRadius: 12 }} /> : <Tile icon="bag" />}
                title={product.name}
                right={<LinkButton title={t("col.remove")} color={colors.danger} onPress={() => void run(() => removeFromCollection(open.id, [product.id]), () => setOpen((current) => (current ? { ...current, products: current.products.filter((item) => item.product.id !== product.id) } : current)))} />}
              />
            ))}
          </List>
        ) : (
          <T style={{ color: colors.inkSoft }}>{t("col.empty")}</T>
        )}
        {problem ? <Notice>{problem}</Notice> : null}
        <PillButton tone="white" icon="plus" title={t("col.add")} onPress={() => setPicking(true)} />
      </Sheet>

      <ProductPickSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("col.add")}
        products={products.data}
        loading={products.loading}
        exclude={open?.products.map((item) => item.product.id) ?? []}
        onPick={(product) => {
          setPicking(false);
          if (open) void run(() => addToCollection(open.id, [product.id]), () => setOpen((current) => (current ? { ...current, products: [...current.products, { product: { id: product.id, name: product.name, images: product.images } }] } : current)));
        }}
      />
    </>
  );
}

function Content() {
  const t = useT("m_shop");
  const list = useLoad(fetchContentCollections);
  return (
    <>
      {list.loading && !list.data ? <LoadingBlock /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.data && !list.data.length ? <EmptyState icon="doc" title={t("cms.none")} /> : null}
      {list.data?.length ? (
        <List>
          {list.data.map((collection) => (
            <Row key={collection.id} lead={<Tile icon="doc" tone="butter" />} title={collection.name} sub={t("cms.count", { count: collection.itemCount, live: collection.liveCount })} right={<WebBadge />} onPress={() => void openWeb(`/home/cms/${collection.id}`)} />
          ))}
        </List>
      ) : null}
      <WebRow title={t("cms.web")} sub={t("cms.webSub")} path="/home/cms" />
    </>
  );
}
