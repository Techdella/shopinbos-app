import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { LinkShareButtons } from "@/components/LinkShareButtons";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { ButtonRow, Card, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchBio, fetchPublishedProducts, saveBio } from "@/lib/paylinks";
import { blockTaps, linkBlock, MAX_BIO_BLOCKS, moveBlock, productBlock, removeBlock, shortUrl, type BioBlock, type BioPage } from "@/lib/paylinks-pure";
import { openShop } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Link in bio (web /home/social/link-in-bio): the page's link (copy, share, open), live on/off, name and short line,
// and its blocks with tap counts. On the phone: add product and link blocks, move blocks up and down, remove them.
// Colours, photo and the other block kinds aren't edited on the phone; saving keeps them as they are.

type Draft = Pick<BioPage, "published" | "title" | "bio" | "avatarUrl" | "theme" | "blocks">;

const BLOCK_ICON = { product: "bag", link: "link", collection: "grid", socials: "users", whatsapp: "chat", signup: "mail", text: "doc", shop: "store", arrivals: "grid", track: "truck" } as const;

export default function LinkInBio() {
  const t = useT("m_paylinks", "m_ui");
  const page = useLoad(fetchBio);
  const products = useLoad(fetchPublishedProducts);
  // The seller's unsaved changes; without any, the page as the server has it (a refresh on focus never drops edits).
  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [adding, setAdding] = useState<"product" | "link" | null>(null);
  const [buyNow, setBuyNow] = useState(true);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BioBlock | null>(null);

  const draft: Draft | null = edits ?? (page.data ? { published: page.data.published, title: page.data.title, bio: page.data.bio, avatarUrl: page.data.avatarUrl, theme: page.data.theme, blocks: page.data.blocks } : null);
  const dirty = edits !== null;

  const productName = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product.name])), [products.data]);

  function change(next: Partial<Draft>) {
    if (!draft) return;
    setEdits({ ...draft, ...next });
    setNote(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setNote(null);
    try {
      const saved = await saveBio(draft);
      page.setData(saved);
      setEdits(null);
      setNote({ tone: "success", text: t("bio.saved") });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("bio.couldNotSave") });
    } finally {
      setSaving(false);
    }
  }

  function addLink() {
    const result = linkBlock(linkLabel, linkUrl);
    if (!result.ok) return setLinkProblem(t(`problem.${result.problem}`));
    change({ blocks: [...(draft?.blocks ?? []), result.block] });
    setAdding(null);
    setLinkLabel("");
    setLinkUrl("");
    setLinkProblem(null);
  }

  function describe(block: BioBlock): { title: string; sub?: string } {
    switch (block.type) {
      case "product":
        return { title: block.label || productName.get(block.productId) || t("block.someProduct"), sub: block.action === "pay" ? t("block.buyNow") : t("block.openPage") };
      case "link":
        return { title: block.label, sub: shortUrl(block.url) };
      case "collection":
        return { title: block.label || t("block.collection"), sub: t("block.collection") };
      case "socials":
        return { title: t("block.socials"), sub: Object.entries(block.links).filter(([, value]) => value?.trim()).map(([key]) => key).join(", ") || undefined };
      case "whatsapp":
        return { title: block.label || t("block.whatsapp"), sub: block.phone };
      case "signup":
        return { title: block.title || t("block.signup"), sub: t("block.signup") };
      case "text":
        return { title: block.text, sub: t("block.text") };
      case "shop":
        return { title: block.label || t("block.shop"), sub: t("block.shopSub") };
      case "arrivals":
        return { title: block.label || t("block.arrivals"), sub: t("block.arrivalsSub") };
      case "track":
        return { title: block.label || t("block.track"), sub: t("block.trackSub") };
      default:
        // A block type a newer server added: still listed (and can be moved or removed), never a crash.
        return { title: t("block.other") };
    }
  }

  if (!page.data || !draft) {
    return (
      <Screen title={t("bio.title")} sub={t("bio.sub")}>
        {page.loading ? <LoadingBlock /> : null}
        {page.error ? <ErrorState message={page.error} onRetry={() => void page.reload()} /> : null}
      </Screen>
    );
  }

  const full = draft.blocks.length >= MAX_BIO_BLOCKS;
  const url = page.data.url;

  return (
    <Screen
      title={t("bio.title")}
      sub={t("bio.sub")}
      refreshing={page.refreshing}
      onRefresh={() => void page.refresh()}
      footer={
        <View style={{ gap: 8 }}>
          {note ? <Notice tone={note.tone}>{note.text}</Notice> : dirty ? <Notice tone="info">{t("bio.unsaved")}</Notice> : null}
          <PillButton testID="save-bio" title={t("bio.save")} busy={saving} disabled={!dirty && page.data.exists} onPress={() => void save()} />
        </View>
      }
    >
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 17 }}>{t("bio.yourPage")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("bio.views", { count: page.data.views })}</T>
        </View>
        {!page.data.exists ? <Notice tone="info">{t("bio.notSaved")}</Notice> : null}
        <LinkShareButtons url={url} message={t("bio.shareMessage", { url })} showWhatsapp={false} />
        <LinkButton title={t("bio.open")} onPress={() => void openShop(url)} />
      </Card>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T weight="bold" style={{ fontSize: 16 }}>{t("bio.published")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2 }}>{t("bio.publishedHint")}</T>
          </View>
          <Toggle on={draft.published} onChange={(published) => change({ published })} label={t("bio.published")} />
        </View>
        <View>
          <Label>{t("bio.name")}</Label>
          <Field value={draft.title} onChangeText={(title) => change({ title })} maxLength={80} />
        </View>
        <View>
          <Label>{t("bio.bioLine")}</Label>
          <Field value={draft.bio} onChangeText={(bio) => change({ bio })} maxLength={300} multiline style={{ height: 88, paddingTop: 14, textAlignVertical: "top" }} />
        </View>
      </Card>

      <T weight="extrabold" style={{ fontSize: 17, marginTop: 4 }} accessibilityRole="header">{t("bio.blocks")}</T>
      {!draft.blocks.length ? <EmptyState icon="link" title={t("bio.noBlocks")} /> : null}
      {draft.blocks.map((block, index) => {
        const words = describe(block);
        const taps = blockTaps(page.data!.clicks, block.id);
        return (
          <Card key={block.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name={BLOCK_ICON[block.type] ?? "doc"} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 15.5 }} numberOfLines={2}>{words.title}</T>
                {words.sub ? <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{words.sub}</T> : null}
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("bio.taps", { count: taps })}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <RoundButton label={t("bio.up")} disabled={index === 0} onPress={() => change({ blocks: moveBlock(draft.blocks, index, -1) })} rotate="-90deg" />
              <RoundButton label={t("bio.down")} disabled={index === draft.blocks.length - 1} onPress={() => change({ blocks: moveBlock(draft.blocks, index, 1) })} rotate="90deg" />
              <View style={{ flex: 1 }} />
              <LinkButton title={t("bio.remove")} color={colors.danger} onPress={() => setRemoving(block)} />
            </View>
          </Card>
        );
      })}

      {full ? <Notice tone="info">{t("bio.full")}</Notice> : (
        <ButtonRow labels={[t("bio.addProduct"), t("bio.addLink")]} icons gap={8}>
          <PillButton size="md" tone="white" style={{ flex: 1 }} onPress={() => setAdding("product")} accessibilityLabel={t("bio.addProduct")} icon="plus" title={t("bio.addProduct")} />
          <PillButton size="md" tone="white" style={{ flex: 1 }} onPress={() => setAdding("link")} accessibilityLabel={t("bio.addLink")} icon="link" title={t("bio.addLink")} />
        </ButtonRow>
      )}

      <ProductPickSheet
        visible={adding === "product"}
        onClose={() => setAdding(null)}
        title={t("create.pickTitle")}
        products={products.data}
        loading={products.loading}
        header={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15.5 }}>{t("pick.buyNow")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2 }}>{t("pick.buyNowHint")}</T>
            </View>
            <Toggle on={buyNow} onChange={setBuyNow} label={t("pick.buyNow")} />
          </View>
        }
        onPick={(product) => {
          change({ blocks: [...draft.blocks, productBlock(product.id, buyNow)] });
          setAdding(null);
        }}
      />

      <Sheet visible={adding === "link"} onClose={() => setAdding(null)} title={t("link.title")}>
        <View>
          <Label>{t("link.label")}</Label>
          <Field value={linkLabel} onChangeText={(value) => { setLinkLabel(value); setLinkProblem(null); }} maxLength={80} placeholder={t("link.labelHint")} />
        </View>
        <View>
          <Label>{t("link.url")}</Label>
          <Field value={linkUrl} onChangeText={(value) => { setLinkUrl(value); setLinkProblem(null); }} maxLength={500} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
        </View>
        {linkProblem ? <Notice>{linkProblem}</Notice> : null}
        <PillButton title={t("link.add")} onPress={addLink} />
      </Sheet>

      <Sheet visible={Boolean(removing)} onClose={() => setRemoving(null)} title={t("bio.removeTitle")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("bio.removeBody")}</T>
        <PillButton
          title={t("bio.removeYes")}
          style={{ backgroundColor: colors.dangerFill }}
          onPress={() => {
            if (removing) change({ blocks: removeBlock(draft.blocks, removing.id) });
            setRemoving(null);
          }}
        />
        <LinkButton title={t("bio.keep")} onPress={() => setRemoving(null)} />
      </Sheet>
    </Screen>
  );
}

/** A round arrow button (move a block up or down). */
function RoundButton({ label, onPress, disabled, rotate }: { label: string; onPress: () => void; disabled?: boolean; rotate: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <View style={{ transform: [{ rotate }] }}>
        <AppIcon name="chevron" size={18} />
      </View>
    </Pressable>
  );
}
