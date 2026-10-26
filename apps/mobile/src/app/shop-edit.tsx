import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { List, Row, Seg } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { PhotoSourceSheet } from "@/components/PhotoSourceSheet";
import { Screen } from "@/components/Screen";
import { Section } from "@/components/seller/bits";
import { PublishButton } from "@/components/seller/PublishShop";
import { WebBadge } from "@/components/WebBadge";
import { Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { uploadIdentityImage } from "@/lib/identity";
import { pickPhotos, uploadPhoto, type PhotoSource } from "@/lib/photos";
import {
  ACCENT_CHOICES,
  accentOp,
  announcementOp,
  featuredOp,
  fetchEditor,
  heroCopyOp,
  heroImageOp,
  moveOp,
  readShopEdit,
  saveEditorOps,
  saveShopDetails,
  shopTagline,
  toggleOp,
  type EditorData,
  type EditorOp,
} from "@/lib/shop-edit";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Edit my shop: the look the seller picked, changed on the phone with the web builder's data and save routes
// (lib/shop-edit.ts): the name, tagline and announcement, the colour, the logo, the banner picture and words,
// which homepage sections show and in what order, and the featured products. Pictures come from the camera or the
// gallery. Words save with Save changes; a tap on a colour, a picture, a section or a product saves at once. The
// changes are in the draft until the seller publishes (the button at the bottom); Preview shows the draft.

type PhotoTarget = "logo" | "banner";

export default function EditMyShop() {
  const t = useT("m_shop");
  const loaded = useLoad(fetchEditor);
  const data = loaded.data;
  return (
    <Screen title={t("editShop.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {data && !data.draft ? (
        <EmptyState
          icon="image"
          title={t("editShop.noLook")}
          action={<PillButton title={t("editShop.pickLook")} size="sm" onPress={() => router.replace("/templates" as never)} />}
        />
      ) : null}
      {data?.draft ? <Editor key={data.store.id} initial={data} /> : null}
    </Screen>
  );
}

function Editor({ initial }: { initial: EditorData }) {
  const t = useT("m_shop");
  const [data, setData] = useState(initial);
  const draft = data.draft!;
  const edit = useMemo(() => readShopEdit(draft), [draft]);
  const [name, setName] = useState(initial.store.name);
  const [tagline, setTagline] = useState(shopTagline(initial));
  const [announcement, setAnnouncement] = useState(edit.announcement?.text ?? "");
  const [heroTitle, setHeroTitle] = useState(edit.hero?.title ?? "");
  const [heroBody, setHeroBody] = useState(edit.hero?.body ?? "");
  const [heroCta, setHeroCta] = useState(edit.hero?.cta ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.store.logoUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<PhotoTarget | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [picking, setPicking] = useState(false);

  const words = { name, tagline, announcement, heroTitle, heroBody, heroCta };
  const savedWords = { name: data.store.name, tagline: shopTagline(data), announcement: edit.announcement?.text ?? "", heroTitle: edit.hero?.title ?? "", heroBody: edit.hero?.body ?? "", heroCta: edit.hero?.cta ?? "" };
  const dirty = (Object.keys(words) as Array<keyof typeof words>).some((key) => words[key].trim() !== savedWords[key].trim());

  // A saved draft from the server replaces the local one, so the next change starts from what was saved.
  async function apply(ops: Array<EditorOp | null>, id: string) {
    const list = ops.filter((op): op is EditorOp => Boolean(op));
    if (!list.length) return true;
    setBusy(id);
    setNote(null);
    try {
      const saved = await saveEditorOps(list);
      setData((current) => ({ ...current, draft: saved.draft }));
      return true;
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("editShop.saveFailed") });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveWords() {
    setBusy("words");
    setNote(null);
    try {
      if (name.trim() !== savedWords.name.trim() || tagline.trim() !== savedWords.tagline.trim()) {
        await saveShopDetails({ name: name.trim() || savedWords.name, tagline });
        setData((current) => ({ ...current, store: { ...current.store, name: name.trim() || current.store.name, brandSettings: { ...(current.store.brandSettings ?? {}), tagline: tagline.trim() } } }));
      }
      const ops = [
        announcement.trim() !== savedWords.announcement.trim() ? announcementOp(edit, announcement) : null,
        heroTitle !== savedWords.heroTitle || heroBody !== savedWords.heroBody || heroCta !== savedWords.heroCta ? heroCopyOp(edit, { title: heroTitle, body: heroBody, cta: heroCta }) : null,
      ].filter((op): op is EditorOp => Boolean(op));
      if (ops.length) {
        const saved = await saveEditorOps(ops);
        setData((current) => ({ ...current, draft: saved.draft }));
      }
      setNote({ tone: "success", text: t("editShop.saved") });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("editShop.saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(target: PhotoTarget, source: PhotoSource) {
    const picked = await pickPhotos(source, 1).catch(() => []);
    if (picked === "denied") return setNote({ tone: "info", text: source === "camera" ? t("photo.allowCamera") : t("photo.allowGallery") });
    if (!picked.length) return;
    setBusy(target);
    setNote(null);
    try {
      if (target === "logo") {
        const identity = await uploadIdentityImage("logo", picked[0]);
        setLogoUrl(identity.logoUrl);
      } else {
        const url = await uploadPhoto(picked[0], "store-banners");
        setBusy(null);
        await apply([heroImageOp(draft, edit, url)], "banner");
      }
    } catch (uploadError) {
      setNote({ tone: "error", text: uploadError instanceof Error ? uploadError.message : t("editShop.photoFailed") });
    } finally {
      setBusy(null);
    }
  }

  const products = data.store.storeProducts ?? [];
  const featured = edit.featured?.productIds ?? [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const unpicked = products.filter((product) => !featured.includes(product.id));

  return (
    <>
      {/* The shop's name, its one-line tagline and the strip across the top of every page. */}
      <Section title={t("editShop.details")}>
        <View style={{ gap: 12 }}>
          <View>
            <Label>{t("editShop.name")}</Label>
            <Field value={name} onChangeText={setName} maxLength={60} accessibilityLabel={t("editShop.name")} />
          </View>
          <View>
            <Label>{t("editShop.tagline")}</Label>
            <Field value={tagline} onChangeText={setTagline} maxLength={120} placeholder={t("editShop.taglineHint")} accessibilityLabel={t("editShop.tagline")} />
          </View>
          {edit.announcement ? (
            <View>
              <Label>{t("editShop.announcement")}</Label>
              <Field value={announcement} onChangeText={setAnnouncement} maxLength={140} placeholder={t("editShop.announcementHint")} accessibilityLabel={t("editShop.announcement")} />
            </View>
          ) : null}
        </View>
      </Section>

      <Section title={t("editShop.logoAndColour")}>
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Picture uri={logoUrl} name={name || data.store.name} size={64} shape="square" />
            <PillButton testID="edit-logo" title={logoUrl ? t("editShop.changeLogo") : t("editShop.addLogo")} tone="white" size="sm" busy={busy === "logo"} disabled={busy !== null} onPress={() => setPhotoFor("logo")} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={t("editShop.colour")}>
            {ACCENT_CHOICES.map((colour) => {
              const on = edit.accent?.toUpperCase() === colour;
              return (
                <Pressable
                  key={colour}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: busy !== null }}
                  accessibilityLabel={t("editShop.colourName", { colour })}
                  disabled={busy !== null}
                  onPress={() => void apply([accentOp(colour)], "colour")}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colour, borderWidth: on ? 3 : 1, borderColor: on ? colors.ink : colors.line, alignItems: "center", justifyContent: "center" }}
                >
                  {on ? <AppIcon name="check" size={18} color={colour === "#16141F" ? "#FFFFFF" : colors.ink} strokeWidth={3} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Section>

      {edit.hero ? (
        <Section title={t("editShop.banner")}>
          <View style={{ gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={edit.hero.imageUrl ? t("editShop.changePicture") : t("editShop.addPicture")} disabled={busy !== null} onPress={() => setPhotoFor("banner")} style={{ height: 160, borderRadius: radii.card, overflow: "hidden", backgroundColor: colors.lilac, alignItems: "center", justifyContent: "center" }}>
              {edit.hero.imageUrl ? <Image source={{ uri: edit.hero.imageUrl }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 40 }}>
                <AppIcon name="camera" size={17} />
                <T weight="bold" style={{ fontSize: 14 }}>{busy === "banner" ? t("editShop.uploading") : edit.hero.imageUrl ? t("editShop.changePicture") : t("editShop.addPicture")}</T>
              </View>
            </Pressable>
            <View>
              <Label>{t("editShop.heading")}</Label>
              <Field value={heroTitle} onChangeText={setHeroTitle} maxLength={120} multiline accessibilityLabel={t("editShop.heading")} />
            </View>
            <View>
              <Label>{t("editShop.text")}</Label>
              <Field value={heroBody} onChangeText={setHeroBody} maxLength={240} multiline accessibilityLabel={t("editShop.text")} />
            </View>
            <View>
              <Label>{t("editShop.button")}</Label>
              <Field value={heroCta} onChangeText={setHeroCta} maxLength={40} accessibilityLabel={t("editShop.button")} />
            </View>
          </View>
        </Section>
      ) : null}

      {dirty ? <PillButton testID="edit-save" tone="accent" title={t("editShop.save")} busy={busy === "words"} disabled={busy !== null && busy !== "words"} onPress={() => void saveWords()} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {/* The homepage's sections: show or hide each one, and move it up or down. */}
      <Section title={t("editShop.sections")}>
        <List>
          {edit.sections.map((section, index) => (
            <Row
              key={section.id}
              title={t.dynamic(`sec.${section.kind}`, section.name)}
              titleStyle={{ color: section.visible ? colors.ink : colors.inkSoft }}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MoveButton label={t("editShop.moveUp", { name: section.name })} icon="up" disabled={busy !== null || index === 0} onPress={() => void apply([moveOp(draft, section.id, -1)], `move:${section.id}`)} />
                  <MoveButton label={t("editShop.moveDown", { name: section.name })} icon="down" disabled={busy !== null || index === edit.sections.length - 1} onPress={() => void apply([moveOp(draft, section.id, 1)], `move:${section.id}`)} />
                  <Toggle label={t("editShop.show", { name: section.name })} on={section.visible} onChange={(on) => void apply([toggleOp(section.id, on)], `toggle:${section.id}`)} />
                </View>
              }
            />
          ))}
        </List>
      </Section>

      {edit.featured ? (
        <Section title={t("editShop.featured")}>
          <View style={{ gap: 10 }}>
            {featured.length ? (
              <List>
                {featured.map((id) => {
                  const product = byId.get(id);
                  if (!product) return null;
                  return (
                    <Row
                      key={id}
                      lead={<Picture uri={product.images[0]} name={product.name} size={44} shape="square" />}
                      title={product.name}
                      right={
                        <Pressable accessibilityRole="button" accessibilityLabel={t("editShop.removeProduct", { name: product.name })} hitSlop={8} disabled={busy !== null} onPress={() => void apply([featuredOp(edit, featured.filter((entry) => entry !== id))], "featured")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                          <AppIcon name="x" size={18} color={colors.inkSoft} />
                        </Pressable>
                      }
                    />
                  );
                })}
              </List>
            ) : (
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{products.length ? t("editShop.featuredNone") : t("editShop.noProducts")}</T>
            )}
            {unpicked.length ? (
              picking ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {unpicked.slice(0, 30).map((product) => (
                    <Seg key={product.id} label={product.name} on={false} onPress={() => void apply([featuredOp(edit, [...featured, product.id])], "featured").then(() => setPicking(false))} />
                  ))}
                </View>
              ) : (
                <PillButton testID="edit-add-product" title={t("editShop.addProduct")} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => setPicking(true)} />
              )
            ) : null}
          </View>
        </Section>
      ) : null}

      {/* Rex makes bigger changes (a new banner, a section rebuilt): he edits this same draft. */}
      <List>
        <Row lead={<AppIcon name="sparkle" size={22} color={colors.accentInk} />} title={t("editShop.askRex")} chevron onPress={() => router.push({ pathname: "/rex", params: { prompt: t("editShop.rexPrompt") } })} />
        <Row lead={<AppIcon name="image" size={22} />} title={t("editShop.changeLook")} chevron onPress={() => router.push("/templates" as never)} />
      </List>

      <View style={{ gap: 6 }}>
        <PublishButton title={t("editShop.publish")} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <LinkButton title={t("editShop.preview")} onPress={() => void openWeb(`/s/${encodeURIComponent(data.store.slug)}/preview`)} />
          <WebBadge />
        </View>
      </View>

      <PhotoSourceSheet visible={photoFor !== null} onClose={() => setPhotoFor(null)} title={photoFor === "logo" ? t("editShop.logoTitle") : t("editShop.bannerTitle")} onPick={(source) => photoFor && void addPhoto(photoFor, source)} />
    </>
  );
}

function MoveButton({ label, icon, disabled, onPress }: { label: string; icon: "up" | "down"; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={4} onPress={onPress} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }}>
      <View style={{ transform: [{ rotate: icon === "up" ? "-90deg" : "90deg" }] }}>
        <AppIcon name="chevron" size={18} />
      </View>
    </Pressable>
  );
}

