import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import type { IdentityImageKind } from "@shared/identity-images";
import { AppearanceRow } from "@/components/AppearancePicker";
import { LanguageRow } from "@/components/LanguagePicker";
import { TipsRow } from "@/components/learn/TipsRow";
import { ErrorState, LinkRow, LoadingBlock, Picture, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, LinkButton, Notice, PillButton, T, WithTip } from "@/components/ui";
import { fetchIdentity, removeIdentityImage, uploadIdentityImage, type Identity } from "@/lib/identity";
import { fetchProfile, saveProfile, type MeFields, type SellerProfile, type ShopFields } from "@/lib/seller-settings";
import { changedFields } from "@/lib/settings-pure";
import { PRIVACY_URL, TERMS_URL } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Settings (web /home/settings, Store tab): the shop's logo, name, description, city, state and phone; the
// seller's own photo and name (photo and logo through the web uploader's API, lib/identity.ts); language, notifications and help. Team, billing, security, Peggy and Rex choices
// and closing the shop aren't on the phone. Email and phone are shown here and changed in My details (app/my-details.tsx).

type ShopForm = Record<ShopFields, string>;
type MeForm = Record<MeFields, string>;

function shopForm(profile: SellerProfile): ShopForm {
  const shop = profile.shop;
  return { name: shop?.name ?? "", description: shop?.description ?? "", city: shop?.city ?? "", state: shop?.state ?? "", phone: shop?.phone ?? "" };
}

function meForm(profile: SellerProfile): MeForm {
  return { name: profile.me.name, phone: profile.me.phone };
}

/** The profile and the pictures (photo and logo, the web uploader's API); the page still opens without the pictures. */
const loadSettings = () =>
  Promise.all([fetchProfile(), fetchIdentity().catch(() => null)]).then(([profile, identity]) => ({ profile, identity }));

export default function Settings() {
  const t = useT("m_settings");
  const loaded = useLoad(loadSettings);
  if (!loaded.data) {
    return (
      <Screen title={t("set.title")} sub={t("set.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  return <SettingsForm initial={loaded.data.profile} identity={loaded.data.identity} />;
}

function SettingsForm({ initial, identity }: { initial: SellerProfile; identity: Identity | null }) {
  const t = useT("m_settings", "m_products", "m_find", "common");
  const tUi = useT("m_ui");
  const tDetails = useT("details");
  const [saved, setSaved] = useState(initial);
  const [shop, setShop] = useState<ShopForm>(shopForm(initial));
  const [me, setMe] = useState<MeForm>(meForm(initial));
  // The logo is the store's logo (the same one as Brand kit on the web); the photo is the person's own.
  const [logoUrl, setLogoUrl] = useState(identity?.logoUrl ?? initial.shop?.logoUrl ?? null);
  const [avatarUrl, setAvatarUrl] = useState(identity?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<IdentityImageKind | "remove-avatar" | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const shopChanges = changedFields(shopForm(saved), shop);
  const meChanges = changedFields(meForm(saved), me);
  const dirty = Object.keys(shopChanges).length > 0 || Object.keys(meChanges).length > 0;

  async function save() {
    if (saved.shop && !shop.name.trim()) return setNote({ tone: "error", text: t("set.needShopName") });
    if (me.name.trim().length < 2) return setNote({ tone: "error", text: t("set.needName") });
    setSaving(true);
    setNote(null);
    try {
      const next = await saveProfile({
        ...(saved.shop && Object.keys(shopChanges).length ? { shop: shopChanges } : {}),
        ...(Object.keys(meChanges).length ? { me: meChanges } : {}),
      });
      setSaved(next);
      setShop(shopForm(next));
      setMe(meForm(next));
      setNote({ tone: "success", text: t("set.saved") });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("set.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  /** Pick a square picture and upload it as the shop logo or the person's photo (POST /api/app/me/images). */
  async function pickImage(kind: IdentityImageKind) {
    setNote(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setNote({ tone: "info", text: t("drafts.allowPhotos") });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets.length) return;
    setUploading(kind);
    try {
      const next = await uploadIdentityImage(kind, result.assets[0]);
      setLogoUrl(next.logoUrl);
      setAvatarUrl(next.avatarUrl);
      setNote({ tone: "success", text: kind === "logo" ? t("set.logoSaved") : t("set.photoSaved") });
    } catch (uploadError) {
      setNote({ tone: "error", text: uploadError instanceof Error ? uploadError.message : kind === "logo" ? t("set.logoFailed") : t("set.photoFailed") });
    } finally {
      setUploading(null);
    }
  }

  async function removePhoto() {
    if (uploading) return;
    setNote(null);
    setUploading("remove-avatar");
    try {
      const next = await removeIdentityImage("avatar");
      setAvatarUrl(next.avatarUrl);
      setNote({ tone: "success", text: t("set.photoRemoved") });
    } catch (removeError) {
      setNote({ tone: "error", text: removeError instanceof Error ? removeError.message : t("set.photoRemoveFailed") });
    } finally {
      setUploading(null);
    }
  }

  // Each box reads and writes its own field (the latest form, so quick typing in two boxes never loses a letter).
  const shopField = (key: ShopFields) => ({ value: shop[key], onChangeText: (text: string) => setShop((current) => ({ ...current, [key]: text })) });
  const meField = (key: MeFields) => ({ value: me[key], onChangeText: (text: string) => setMe((current) => ({ ...current, [key]: text })) });

  return (
    <Screen
      title={t("set.title")}
      sub={t("set.sub")}
      footer={dirty ? <PillButton title={t("set.save")} busy={saving} onPress={() => void save()} /> : undefined}
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {saved.shop ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={logoUrl ? t("set.changeLogo") : t("set.addLogo")} onPress={() => void pickImage("logo")} disabled={uploading !== null}>
              <Picture uri={logoUrl} name={shop.name || saved.shop.name} size={72} shape="square" />
            </Pressable>
            <View style={{ flex: 1, gap: 8 }}>
              <WithTip title={t("set.logo")} tip={{ text: t("set.logoHint") }}>
                <T weight="extrabold" style={{ fontSize: 16 }}>{t("set.logo")}</T>
              </WithTip>
              <PillButton title={logoUrl ? t("set.changeLogo") : t("set.addLogo")} tone="white" size="sm" busy={uploading === "logo"} disabled={uploading !== null} onPress={() => void pickImage("logo")} />
            </View>
          </Card>

          <SectionTitle>{t("set.shop")}</SectionTitle>
          <Card style={{ gap: 14 }}>
            <View>
              <Label>{t("set.shopName")}</Label>
              <Field maxLength={120} accessibilityLabel={t("set.shopName")} {...shopField("name")} />
            </View>
            <View>
              <Label>{t("set.about")}</Label>
              <Field multiline maxLength={2000} placeholder={t("set.aboutHint")} accessibilityLabel={t("set.about")} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} {...shopField("description")} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Label>{t("set.city")}</Label>
                <Field maxLength={80} placeholder="Ikeja" accessibilityLabel={t("set.city")} {...shopField("city")} />
              </View>
              <View style={{ flex: 1 }}>
                <Label>{t("set.state")}</Label>
                <Field maxLength={80} placeholder="Lagos" accessibilityLabel={t("set.state")} {...shopField("state")} />
              </View>
            </View>
            <View>
              <Label>{t("set.shopPhone")}</Label>
              <Field keyboardType="phone-pad" maxLength={40} placeholder="0803 000 0000" accessibilityLabel={t("set.shopPhone")} {...shopField("phone")} />
              <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("set.shopPhoneHint")}</T>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <ReadOnly label={t("set.country")} value={saved.shop.country} />
              <ReadOnly label={t("set.currency")} value={saved.shop.currency} />
            </View>
          </Card>
        </>
      ) : (
        <Notice tone="info">{t("set.noShop")}</Notice>
      )}

      <SectionTitle>{t("set.you")}</SectionTitle>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={avatarUrl ? t("set.changePhoto") : t("set.addPhoto")} onPress={() => void pickImage("avatar")} disabled={uploading !== null}>
            <Picture uri={avatarUrl} name={me.name || saved.me.name} size={72} />
          </Pressable>
          <View style={{ flex: 1, gap: 8 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{t("set.photo")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 19 }}>{t("set.photoHint")}</T>
            <PillButton title={avatarUrl ? t("set.changePhoto") : t("set.addPhoto")} tone="white" size="sm" busy={uploading === "avatar"} disabled={uploading !== null} onPress={() => void pickImage("avatar")} />
            {avatarUrl ? <LinkButton title={uploading === "remove-avatar" ? "…" : t("set.removePhoto")} color={colors.inkSoft} onPress={() => void removePhoto()} /> : null}
          </View>
        </View>
        <View>
          <Label>{t("set.yourName")}</Label>
          <Field maxLength={120} autoComplete="name" accessibilityLabel={t("set.yourName")} {...meField("name")} />
        </View>
        {/* Email and phone are how the seller logs in: they change in My details, with a link or a code. */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ReadOnly label={t("set.email")} value={saved.me.email ?? t("set.noEmail")} />
          <ReadOnly label={t("set.yourPhone")} value={saved.me.phone || tDetails("phoneNone")} />
        </View>
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{tDetails("settingsHint")}</T>
        <PillButton title={tDetails("menu")} tone="white" size="sm" onPress={() => router.push("/my-details")} />
      </Card>

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="user" label={tDetails("menu")} hint={tDetails("menuHint")} onPress={() => router.push("/my-details")} />
        <LanguageRow />
        <AppearanceRow />
        <TipsRow />
        <LinkRow icon="bell" label={t("set.notifications")} hint={t("set.notificationsHint")} onPress={() => router.push("/notifications/settings")} />
        {/* The markup added to supplier prices when the seller adds their products (app/find/markup.tsx). */}
        <LinkRow icon="tag" label={t("markup.settingsRow")} hint={t("markup.settingsHint")} onPress={() => router.push("/find/markup")} />
        <LinkRow icon="help" label={t("set.help")} hint={t("set.helpHint")} onPress={() => router.push("/help")} />
      </Card>

      <Card style={{ paddingVertical: 2 }}>
        <LinkRow first icon="doc" label={tUi("more.terms")} onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} />
        <LinkRow icon="doc" label={tUi("more.privacy")} hint={tUi("more.privacyHint")} onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)} />
      </Card>
    </Screen>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <View style={{ minHeight: 52, borderRadius: radii.field, backgroundColor: colors.canvas, paddingHorizontal: 16, justifyContent: "center" }}>
        <T style={{ fontSize: 16 }}>{value}</T>
      </View>
    </View>
  );
}
