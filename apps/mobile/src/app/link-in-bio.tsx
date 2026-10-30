import { useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { LinkShareButtons } from "@/components/LinkShareButtons";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { ButtonRow, Card, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchBio, fetchPublishedProducts, saveBio } from "@/lib/paylinks";
import { blockTaps, cleanHandle, linkBlock, MAX_BIO_BLOCKS, moveBlock, newBlockId, productBlock, removeBlock, shortUrl, type BioBlock, type BioPage } from "@/lib/paylinks-pure";
import { pickPhotos, uploadPhoto } from "@/lib/photos";
import { openShop } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Link in bio (web /home/social/link-in-bio): the page's link (copy, share, open), live on/off, the photo at the top
// (the shop logo unless the seller picks another), name and short line, and its blocks with tap counts. Every block
// can be added, edited (tap it), moved and removed: products from the shop (or a new one), the shop's own website,
// other links, WhatsApp, social icons, text, and the Shop now / New arrivals / Track my order buttons. Colours
// stay as they are (the web editor has them).

type Draft = Pick<BioPage, "published" | "title" | "bio" | "avatarUrl" | "theme" | "blocks">;

/** The social icons the phone edits (the server's SOCIAL_KEYS in src/lib/bio/pure.ts). */
const SOCIALS = ["instagram", "tiktok", "whatsapp", "x", "facebook", "youtube"] as const;
const SOCIAL_NAME: Record<(typeof SOCIALS)[number], string> = { instagram: "Instagram", tiktok: "TikTok", whatsapp: "WhatsApp", x: "X", facebook: "Facebook", youtube: "YouTube" };

const BLOCK_ICON = { product: "bag", link: "link", collection: "grid", socials: "users", whatsapp: "whatsapp", signup: "mail", text: "doc", shop: "store", arrivals: "grid", track: "truck" } as const;

export default function LinkInBio() {
  const t = useT("m_paylinks", "m_ui");
  const page = useLoad(fetchBio);
  const products = useLoad(fetchPublishedProducts);
  // The seller's unsaved changes; without any, the page as the server has it (a refresh on focus never drops edits).
  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [adding, setAdding] = useState<"menu" | "product" | null>(null);
  // The block being edited (a copy; saved into the draft with Done), and whether it's new.
  const [editing, setEditing] = useState<{ block: BioBlock; isNew: boolean } | null>(null);
  const [editProblem, setEditProblem] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [buyNow, setBuyNow] = useState(true);
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

  /** Puts an edited block back (or adds a new one) once it's valid. */
  function finishEdit() {
    if (!editing || !draft) return;
    const block = editing.block;
    let ready: BioBlock | null = block;
    if (block.type === "link") {
      const result = linkBlock(block.label, block.url);
      if (!result.ok) return setEditProblem(t(`problem.${result.problem}`));
      ready = { ...block, label: result.block.type === "link" ? result.block.label : block.label, url: result.block.type === "link" ? result.block.url : block.url };
    } else if (block.type === "whatsapp") {
      if (block.phone.replace(/\D/g, "").length < 7) return setEditProblem(t("edit.needPhone"));
    } else if (block.type === "text") {
      if (!block.text.trim()) return setEditProblem(t("edit.needText"));
      ready = { ...block, text: block.text.trim().slice(0, 500) };
    } else if (block.type === "socials") {
      const links = Object.fromEntries(Object.entries(block.links).map(([key, value]) => [key, key === "whatsapp" ? (value ?? "").trim() : cleanHandle(value ?? "")]).filter(([, value]) => value));
      if (!Object.keys(links).length) return setEditProblem(t("edit.needSocial"));
      ready = { ...block, links };
    }
    const blocks = editing.isNew ? [...draft.blocks, ready] : draft.blocks.map((item) => (item.id === block.id ? ready! : item));
    change({ blocks });
    setEditing(null);
    setEditProblem(null);
  }

  function startNew(block: BioBlock, edit: boolean) {
    setAdding(null);
    if (!edit) return change({ blocks: [...(draft?.blocks ?? []), block] });
    setEditProblem(null);
    setEditing({ block, isNew: true });
  }

  /** The block being edited, changed. */
  function patch(next: Partial<BioBlock>) {
    setEditing((current) => (current ? { ...current, block: { ...current.block, ...next } as BioBlock } : current));
    setEditProblem(null);
  }

  async function changePhoto() {
    const picked = await pickPhotos("library");
    if (picked === "denied") return setNote({ tone: "error", text: t("bio.photoDenied") });
    if (!picked.length) return;
    setPhotoBusy(true);
    try {
      change({ avatarUrl: await uploadPhoto(picked[0], "brand") });
    } catch (uploadError) {
      setNote({ tone: "error", text: uploadError instanceof Error ? uploadError.message : t("bio.couldNotSave") });
    } finally {
      setPhotoBusy(false);
    }
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
      <Screen title={t("bio.title")} sub={t("bio.subShort")} tip={t("bio.sub")}>
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
      sub={t("bio.subShort")}
      tip={t("bio.sub")}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {draft.avatarUrl || page.data.storeLogoUrl ? (
            <Image source={{ uri: draft.avatarUrl || page.data.storeLogoUrl }} accessibilityLabel={t("bio.photo")} style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.line }} resizeMode="contain" />
          ) : (
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="store" size={28} />
            </View>
          )}
          <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
            <T weight="bold" style={{ fontSize: 15 }}>{t("bio.photo")}</T>
            <PillButton size="sm" tone="white" icon="image" title={t("bio.changePhoto")} busy={photoBusy} onPress={() => void changePhoto()} />
            {page.data.storeLogoUrl && draft.avatarUrl !== page.data.storeLogoUrl ? <LinkButton title={t("bio.useLogo")} onPress={() => change({ avatarUrl: page.data!.storeLogoUrl! })} /> : null}
          </View>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("bio.editBlock", { name: words.title })}
              onPress={() => {
                setEditProblem(null);
                setEditing({ block, isNew: false });
              }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name={BLOCK_ICON[block.type] ?? "doc"} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 15.5 }} numberOfLines={2}>{words.title}</T>
                {words.sub ? <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{words.sub}</T> : null}
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("bio.taps", { count: taps })}</T>
              <AppIcon name="chevron" size={16} color={colors.inkSoft} />
            </Pressable>
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
        <ButtonRow labels={[t("bio.addBlock"), t("bio.addProduct")]} icons gap={8}>
          <PillButton testID="bio-add" size="md" tone="white" style={{ flex: 1 }} onPress={() => setAdding("menu")} accessibilityLabel={t("bio.addBlock")} icon="plus" title={t("bio.addBlock")} />
          <PillButton size="md" tone="white" style={{ flex: 1 }} onPress={() => setAdding("product")} accessibilityLabel={t("bio.addProduct")} icon="bag" title={t("bio.addProduct")} />
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

      <Sheet visible={adding === "menu"} onClose={() => setAdding(null)} title={t("bio.addBlock")}>
        <ChoiceRow icon="bag" title={t("add.product")} sub={t("add.productSub")} onPress={() => setAdding("product")} />
        <ChoiceRow
          icon="plus"
          title={t("add.newProduct")}
          sub={t("add.newProductSub")}
          onPress={() => {
            setAdding(null);
            router.push("/add-products" as never);
          }}
        />
        {page.data.storeUrl ? <ChoiceRow icon="store" title={t("add.website")} sub={shortUrl(page.data.storeUrl)} onPress={() => startNew({ id: newBlockId(), type: "link", label: t("add.websiteLabel"), url: page.data!.storeUrl! }, true)} /> : null}
        <ChoiceRow icon="link" title={t("add.link")} sub={t("add.linkSub")} onPress={() => startNew({ id: newBlockId(), type: "link", label: "", url: "" }, true)} />
        <ChoiceRow icon="whatsapp" title={t("block.whatsapp")} sub={t("add.whatsappSub")} onPress={() => startNew({ id: newBlockId(), type: "whatsapp", phone: "", label: t("add.whatsappLabel") }, true)} />
        <ChoiceRow icon="users" title={t("block.socials")} sub={t("add.socialsSub")} onPress={() => startNew({ id: newBlockId(), type: "socials", links: {} }, true)} />
        <ChoiceRow icon="doc" title={t("block.text")} sub={t("add.textSub")} onPress={() => startNew({ id: newBlockId(), type: "text", text: "" }, true)} />
        <ChoiceRow icon="store" title={t("block.shop")} sub={t("block.shopSub")} onPress={() => startNew({ id: newBlockId(), type: "shop" }, false)} />
        <ChoiceRow icon="grid" title={t("block.arrivals")} sub={t("block.arrivalsSub")} onPress={() => startNew({ id: newBlockId(), type: "arrivals" }, false)} />
        <ChoiceRow icon="truck" title={t("block.track")} sub={t("block.trackSub")} onPress={() => startNew({ id: newBlockId(), type: "track" }, false)} />
      </Sheet>

      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.isNew ? t("edit.addTitle") : t("edit.title")}>
        {editing ? <BlockFields block={editing.block} patch={patch} productName={productName} /> : null}
        {editProblem ? <Notice>{editProblem}</Notice> : null}
        <PillButton testID="bio-edit-done" title={editing?.isNew ? t("edit.add") : t("edit.done")} onPress={finishEdit} />
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

/** The fields for one block in the edit sheet. */
function BlockFields({ block, patch, productName }: { block: BioBlock; patch: (next: Partial<BioBlock>) => void; productName: Map<string, string> }) {
  const t = useT("m_paylinks", "m_ui");
  switch (block.type) {
    case "product":
      return (
        <View style={{ gap: 14 }}>
          <T weight="bold" style={{ fontSize: 15.5 }}>{productName.get(block.productId) ?? t("block.someProduct")}</T>
          <View>
            <Label>{t("edit.buttonWords")}</Label>
            <Field value={block.label ?? ""} onChangeText={(label) => patch({ label: label || undefined })} maxLength={80} placeholder={productName.get(block.productId) ?? ""} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15.5 }}>{t("pick.buyNow")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2 }}>{t("pick.buyNowHint")}</T>
            </View>
            <Toggle on={block.action === "pay"} onChange={(on) => patch({ action: on ? "pay" : "page" })} label={t("pick.buyNow")} />
          </View>
        </View>
      );
    case "link":
      return (
        <View style={{ gap: 14 }}>
          <View>
            <Label>{t("link.label")}</Label>
            <Field value={block.label} onChangeText={(label) => patch({ label })} maxLength={80} placeholder={t("link.labelHint")} />
          </View>
          <View>
            <Label>{t("link.url")}</Label>
            <Field value={block.url} onChangeText={(url) => patch({ url })} maxLength={500} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
          </View>
        </View>
      );
    case "whatsapp":
      return (
        <View style={{ gap: 14 }}>
          <View>
            <Label>{t("edit.phone")}</Label>
            <Field value={block.phone} onChangeText={(phone) => patch({ phone })} maxLength={20} keyboardType="phone-pad" placeholder="0803 123 4567" />
          </View>
          <View>
            <Label>{t("edit.buttonWords")}</Label>
            <Field value={block.label ?? ""} onChangeText={(label) => patch({ label: label || undefined })} maxLength={80} />
          </View>
          <View>
            <Label>{t("edit.message")}</Label>
            <Field value={block.message ?? ""} onChangeText={(message) => patch({ message: message || undefined })} maxLength={300} placeholder={t("edit.messageHint")} />
          </View>
        </View>
      );
    case "socials":
      return (
        <View style={{ gap: 12 }}>
          {SOCIALS.map((key) => (
            <View key={key}>
              <Label>{SOCIAL_NAME[key]}</Label>
              <Field
                value={block.links[key] ?? ""}
                onChangeText={(value) => patch({ links: { ...block.links, [key]: value } })}
                maxLength={200}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={key === "whatsapp" ? "phone-pad" : "default"}
                placeholder={key === "whatsapp" ? "0803 123 4567" : "@yourshop"}
              />
            </View>
          ))}
        </View>
      );
    case "text":
      return (
        <View>
          <Label>{t("block.text")}</Label>
          <Field value={block.text} onChangeText={(text) => patch({ text })} maxLength={500} multiline style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
        </View>
      );
    case "shop":
    case "arrivals":
    case "track":
    case "collection":
      return (
        <View>
          <Label>{t("edit.buttonWords")}</Label>
          <Field value={block.label ?? ""} onChangeText={(label) => patch({ label: label || undefined })} maxLength={40} placeholder={block.type === "shop" ? t("block.shop") : block.type === "arrivals" ? t("block.arrivals") : block.type === "track" ? t("block.track") : t("block.collection")} />
        </View>
      );
    case "signup":
      return (
        <View style={{ gap: 14 }}>
          <View>
            <Label>{t("edit.signupTitle")}</Label>
            <Field value={block.title ?? ""} onChangeText={(title) => patch({ title: title || undefined })} maxLength={120} />
          </View>
          <View>
            <Label>{t("edit.buttonWords")}</Label>
            <Field value={block.buttonLabel ?? ""} onChangeText={(buttonLabel) => patch({ buttonLabel: buttonLabel || undefined })} maxLength={40} />
          </View>
        </View>
      );
    default:
      return <T style={{ color: colors.inkSoft }}>{t("block.other")}</T>;
  }
}
