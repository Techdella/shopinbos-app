import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { List, Row, Seg } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { PhotoSourceSheet } from "@/components/PhotoSourceSheet";
import { Screen } from "@/components/Screen";
import { Section } from "@/components/seller/bits";
import { BannerHelpers, BannerPreview, BarColours, Group, LinkPicker, PeggyTaglineSheet, RexBannerSheet, RexLogoSheet, useCollections } from "@/components/seller/BannerEditor";
import { PublishButton } from "@/components/seller/PublishShop";
import { WebBadge } from "@/components/WebBadge";
import { Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { uploadIdentityImage } from "@/lib/identity";
import { pickPhotos, uploadPhoto, type PhotoSource } from "@/lib/photos";
import {
  ACCENT_CHOICES,
  accentOp,
  addAnnouncementOp,
  announcementOp,
  announcementSettingsOp,
  announcementVisibleOp,
  featuredOp,
  fetchEditor,
  heroCopyOp,
  heroImageOp,
  heroSettingsOp,
  moveOp,
  readShopEdit,
  saveEditorOps,
  saveShopDetails,
  shopTagline,
  toggleOp,
  type EditorData,
  type EditorOp,
} from "@/lib/shop-edit";
import { BANNER_LIMITS, barSettings, heroLinkSettings, readBarColor, readBarLink, readHeroLink, type BannerCopy, type BannerLink } from "@shared/store-banner";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Edit my shop: the look the seller picked, changed on the phone with the web builder's data and save routes
// (lib/shop-edit.ts): the name, tagline and announcement, the colour, the logo, the banner picture and words,
// which homepage sections show and in what order, and the featured products. Pictures come from the camera or the
// gallery. Words save with Save changes; a tap on a colour, a picture, a section or a product saves at once. The
// changes are in the draft until the seller publishes (the button at the bottom); Preview shows the draft.
// The Banner section (components/seller/BannerEditor.tsx) previews the top of the shop live and has the button's
// link, the announcement bar (on or off, words, link, colour) and Rex and Peggy's helpers: build the banner, make a
// logo, write a tagline (POST /api/mobile/banner, /api/mobile/banner/taglines, /api/ai/generate-logo).

type PhotoTarget = "logo" | "banner";
type Helper = "build" | "logo" | "tagline";

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
  const tb = useT("m_banner");
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
  const [helper, setHelper] = useState<Helper | null>(null);
  const collections = useCollections();

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

  // ─── Banner: the button's link, the announcement bar and the helpers ─────────

  const heroLink = edit.hero ? readHeroLink(edit.hero.settings) : null;
  const barOn = Boolean(edit.announcement?.visible);
  const barLink = edit.announcement ? readBarLink(edit.announcement.settings) : null;
  const barColor = edit.announcement ? readBarColor(edit.announcement.settings) : null;

  const setHeroLink = (link: BannerLink | null) => edit.hero && link && void apply([heroSettingsOp(edit, heroLinkSettings(edit.hero.settings, link))], "heroLink");
  const setBarLink = (link: BannerLink | null) => edit.announcement && void apply([announcementSettingsOp(edit, barSettings(edit.announcement.settings, { link }))], "barLink");
  const setBarColor = (color: string | null) => edit.announcement && void apply([announcementSettingsOp(edit, barSettings(edit.announcement.settings, { color }))], "barColor");
  function setBarOn(on: boolean) {
    if (edit.announcement) return void apply([announcementVisibleOp(edit, on)], "barOn");
    // A look saved without a bar gets one, with what's typed so far.
    if (on) void apply([addAnnouncementOp(announcement)], "barOn");
  }

  /** Rex's banner, as picked: the words (the button keeps its label when Rex wrote none) and the picture. */
  async function applyRexBanner(choice: { copy: BannerCopy | null; imageUrl: string | null }) {
    const copy = choice.copy ? { title: choice.copy.heading, body: choice.copy.text, cta: choice.copy.button || heroCta } : null;
    const done = await apply([copy ? heroCopyOp(edit, copy) : null, choice.imageUrl ? heroImageOp(draft, edit, choice.imageUrl) : null], "rex");
    if (!done) return false;
    if (copy) {
      setHeroTitle(copy.title);
      setHeroBody(copy.body);
      setHeroCta(copy.cta);
    }
    setNote({ tone: "success", text: tb("note.rexApplied") });
    return true;
  }

  function takeLine(line: string, where: "tagline" | "heading") {
    if (where === "tagline") setTagline(line.slice(0, BANNER_LIMITS.tagline));
    else setHeroTitle(line.slice(0, BANNER_LIMITS.heading));
    setHelper(null);
    setNote({ tone: "info", text: where === "tagline" ? tb("note.taglineAdded") : tb("note.headingAdded") });
  }

  const products = data.store.storeProducts ?? [];
  const featured = edit.featured?.productIds ?? [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const unpicked = products.filter((product) => !featured.includes(product.id));

  return (
    <>
      {/* The shop's name and its one-line tagline (Peggy can write one). */}
      <Section title={t("editShop.details")}>
        <View style={{ gap: 12 }}>
          <View>
            <Label>{t("editShop.name")}</Label>
            <Field value={name} onChangeText={setName} maxLength={60} accessibilityLabel={t("editShop.name")} />
          </View>
          <View>
            <Label>{t("editShop.tagline")}</Label>
            <Field value={tagline} onChangeText={setTagline} maxLength={BANNER_LIMITS.tagline} placeholder={t("editShop.taglineHint")} accessibilityLabel={t("editShop.tagline")} />
            <LinkButton testID="edit-tagline-peggy" title={tb("helper.tagline")} style={{ alignSelf: "flex-start", marginTop: 2 }} color={colors.accentInk} onPress={() => setHelper("tagline")} />
          </View>
        </View>
      </Section>

      <Section title={t("editShop.logoAndColour")}>
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Picture uri={logoUrl} name={name || data.store.name} size={64} shape="square" />
            <View style={{ gap: 8, flexShrink: 1 }}>
              <PillButton testID="edit-logo" title={logoUrl ? t("editShop.changeLogo") : t("editShop.addLogo")} tone="white" size="sm" busy={busy === "logo"} disabled={busy !== null} onPress={() => setPhotoFor("logo")} />
              <PillButton testID="edit-logo-rex" title={tb("helper.logo")} icon="sparkle" tone="white" size="sm" disabled={busy !== null} onPress={() => setHelper("logo")} />
            </View>
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

      {/* The banner: a live preview of the top of the shop, Rex and Peggy's helpers, the words, where the button
          goes, and the announcement bar. */}
      <Section title={t("editShop.banner")}>
        <View style={{ gap: 14 }}>
          {edit.hero ? (
            <BannerPreview
              storeName={name.trim() || data.store.name}
              logoUrl={logoUrl}
              imageUrl={edit.hero.imageUrl}
              heading={heroTitle}
              text={heroBody}
              button={heroCta}
              accent={edit.accent ?? colors.ink}
              bar={edit.announcement ? { on: barOn, text: announcement, color: barColor } : null}
              busy={busy !== null}
              onPicture={() => setPhotoFor("banner")}
            />
          ) : (
            <Notice tone="info">{tb("noBanner")}</Notice>
          )}
          <BannerHelpers onBuild={() => setHelper("build")} onLogo={() => setHelper("logo")} onTagline={() => setHelper("tagline")} />
          {edit.hero ? (
            <Group title={tb("group.words")}>
              <View>
                <Label>{t("editShop.heading")}</Label>
                <Field testID="edit-heading" value={heroTitle} onChangeText={setHeroTitle} maxLength={BANNER_LIMITS.heading} multiline accessibilityLabel={t("editShop.heading")} />
              </View>
              <View>
                <Label>{t("editShop.text")}</Label>
                <Field value={heroBody} onChangeText={setHeroBody} maxLength={BANNER_LIMITS.text} multiline accessibilityLabel={t("editShop.text")} />
              </View>
              <View>
                <Label>{t("editShop.button")}</Label>
                <Field value={heroCta} onChangeText={setHeroCta} maxLength={BANNER_LIMITS.button} placeholder={tb("preview.buttonDefault")} accessibilityLabel={t("editShop.button")} />
              </View>
              <LinkPicker label={tb("link.buttonOpens")} value={heroLink} onChange={setHeroLink} products={products} collections={collections} disabled={busy !== null} />
            </Group>
          ) : null}
          <Group title={tb("bar.title")} right={<Toggle label={tb("bar.show")} on={barOn} onChange={setBarOn} />}>
            {barOn ? (
              <>
                <View>
                  <Label>{tb("bar.message")}</Label>
                  <Field testID="edit-announcement" value={announcement} onChangeText={setAnnouncement} maxLength={BANNER_LIMITS.announcement} placeholder={t("editShop.announcementHint")} accessibilityLabel={t("editShop.announcement")} />
                </View>
                <LinkPicker label={tb("link.barOpens")} value={barLink} onChange={setBarLink} products={products} collections={collections} optional disabled={busy !== null} />
                <BarColours value={barColor} onChange={setBarColor} disabled={busy !== null} />
              </>
            ) : (
              <T style={{ fontSize: 14, color: colors.inkSoft }}>{tb("bar.off")}</T>
            )}
          </Group>
        </View>
      </Section>

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

      <RexBannerSheet visible={helper === "build"} onClose={() => setHelper(null)} onApply={applyRexBanner} />
      <RexLogoSheet
        visible={helper === "logo"}
        onClose={() => setHelper(null)}
        storeName={name.trim() || data.store.name}
        onSaved={(url) => {
          setLogoUrl(url);
          setNote({ tone: "success", text: tb("note.logoSaved") });
        }}
      />
      <PeggyTaglineSheet visible={helper === "tagline"} onClose={() => setHelper(null)} current={tagline} onUse={takeLine} />
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

