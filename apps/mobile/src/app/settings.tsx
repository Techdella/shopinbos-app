import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LanguageRow } from "@/components/LanguagePicker";
import { TipsRow } from "@/components/learn/TipsRow";
import { AppIcon } from "@/components/icons";
import { ErrorState, Initials, LinkRow, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { fetchProfile, saveProfile, uploadLogo, type MeFields, type SellerProfile, type ShopFields } from "@/lib/seller-settings";
import { changedFields } from "@/lib/settings-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Settings (web /home/settings, Store tab): the shop's logo, name, description, city, state and phone; the
// seller's own name and phone; language, notifications and help. Team, billing, security, Peggy and Rex choices
// and closing the shop stay on the web ("More settings on the web").

type ShopForm = Record<ShopFields, string>;
type MeForm = Record<MeFields, string>;

function shopForm(profile: SellerProfile): ShopForm {
  const shop = profile.shop;
  return { name: shop?.name ?? "", description: shop?.description ?? "", city: shop?.city ?? "", state: shop?.state ?? "", phone: shop?.phone ?? "" };
}

function meForm(profile: SellerProfile): MeForm {
  return { name: profile.me.name, phone: profile.me.phone };
}

export default function Settings() {
  const t = useT("m_settings");
  const loaded = useLoad(fetchProfile);
  if (!loaded.data) {
    return (
      <Screen title={t("set.title")} sub={t("set.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/settings") }} /> : null}
      </Screen>
    );
  }
  return <SettingsForm initial={loaded.data} />;
}

function SettingsForm({ initial }: { initial: SellerProfile }) {
  const t = useT("m_settings", "m_products", "common");
  const [saved, setSaved] = useState(initial);
  const [shop, setShop] = useState<ShopForm>(shopForm(initial));
  const [me, setMe] = useState<MeForm>(meForm(initial));
  const [logoUrl, setLogoUrl] = useState(initial.shop?.logoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  async function pickLogo() {
    setNote(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setNote({ tone: "info", text: t("drafts.allowPhotos") });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets.length) return;
    setUploading(true);
    try {
      const identity = await uploadLogo(result.assets[0]);
      setLogoUrl(identity.logoUrl);
      setNote({ tone: "success", text: t("set.logoSaved") });
    } catch (uploadError) {
      setNote({ tone: "error", text: uploadError instanceof Error ? uploadError.message : t("set.logoFailed") });
    } finally {
      setUploading(false);
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
            <Pressable accessibilityRole="button" accessibilityLabel={t("set.changeLogo")} onPress={() => void pickLogo()} disabled={uploading}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={{ width: 72, height: 72, borderRadius: radii.field, backgroundColor: colors.canvas }} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <Initials name={shop.name || saved.shop.name} size={72} />
              )}
            </Pressable>
            <View style={{ flex: 1, gap: 8 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("set.logo")}</T>
              <PillButton title={logoUrl ? t("set.changeLogo") : t("set.addLogo")} tone="white" size="sm" busy={uploading} onPress={() => void pickLogo()} />
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
        <View>
          <Label>{t("set.yourName")}</Label>
          <Field maxLength={120} autoComplete="name" accessibilityLabel={t("set.yourName")} {...meField("name")} />
        </View>
        <View>
          <Label>{t("set.email")}</Label>
          <View style={{ minHeight: 52, borderRadius: radii.field, backgroundColor: colors.canvas, paddingHorizontal: 16, justifyContent: "center" }}>
            <T style={{ fontSize: 16 }} numberOfLines={1}>{saved.me.email ?? t("set.noEmail")}</T>
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("set.emailHint")}</T>
        </View>
        <View>
          <Label>{t("set.yourPhone")}</Label>
          <Field keyboardType="phone-pad" maxLength={40} autoComplete="tel" placeholder="0803 000 0000" accessibilityLabel={t("set.yourPhone")} {...meField("phone")} />
        </View>
      </Card>

      <Card style={{ paddingVertical: 2 }}>
        <LanguageRow first />
        <TipsRow />
        <LinkRow icon="bell" label={t("set.notifications")} hint={t("set.notificationsHint")} onPress={() => router.push("/notifications/settings")} />
        <LinkRow icon="help" label={t("set.help")} hint={t("set.helpHint")} onPress={() => router.push("/help")} />
        <LinkRow icon="globe" label={t("set.more")} hint={t("set.moreHint")} onPress={() => void openWeb("/home/settings")} right={<AppIcon name="share" size={18} color={colors.inkSoft} />} />
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
