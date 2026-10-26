import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { FieldLabel } from "@/components/SupplierKit";
import { Field, Notice, PillButton, T } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { useT } from "@/lib/i18n";
import { fetchSupplierProfile, savePublicProfile, uploadSupplierPhoto } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// The business profile shops see (the web's /supplier/profile, in the app): the logo, a few words about the business,
// the WhatsApp number and website. The name, city and what it supplies are in Account › Your business (set-up).
// GET / PATCH /api/supplier/profile; the logo goes up through /api/mobile/supplier/upload first.

export default function SupplierProfile() {
  const t = useT("m_supplier", "common");
  const profile = useLoad(fetchSupplierProfile);
  const data = profile.data;
  const [filled, setFilled] = useState(false);
  const [about, setAbout] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"logo" | "save" | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!data || filled) return;
    setFilled(true);
    setAbout(data.description ?? "");
    setWhatsapp(data.whatsappNumber ?? "");
    setWebsite(data.website ?? "");
    setLogo(data.logoUrl);
  }, [data, filled]);

  async function pickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(t("new.photosOff"), t("new.allowAccess"));
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    setBusy("logo");
    setNote(null);
    try {
      const { url } = await uploadSupplierPhoto({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      await savePublicProfile({ logoUrl: url });
      setLogo(url);
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("profile.failed") });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const site = website.trim();
    const fullSite = site && !/^https?:\/\//i.test(site) ? `https://${site}` : site;
    setBusy("save");
    setNote(null);
    try {
      await savePublicProfile({ description: about.trim(), ...(whatsapp.trim() ? { whatsappNumber: whatsapp.trim() } : {}), ...(fullSite ? { website: fullSite } : {}) });
      setWebsite(fullSite);
      setNote({ tone: "success", text: t("profile.saved") });
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("profile.failed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={t("money.profile")}
      refreshing={profile.refreshing}
      onRefresh={() => void profile.refresh()}
      footer={data ? <PillButton title={t("save")} tone="accent" busy={busy === "save"} disabled={Boolean(busy)} onPress={() => void save()} /> : undefined}
    >
      {profile.loading && !data ? <LoadingBlock /> : null}
      {profile.error && !data ? <ErrorState message={profile.error} onRetry={() => void profile.reload()} /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {data ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={t("profile.logo")} onPress={() => void pickLogo()} disabled={Boolean(busy)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Picture uri={logo} name={data.displayName} size={72} shape="square" />
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold" style={{ fontSize: 17 }} numberOfLines={2}>{data.displayName}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{busy === "logo" ? t("saving") : t("profile.logo")}</T>
            </View>
            <AppIcon name="camera" size={20} color={colors.inkSoft} />
          </Pressable>
          <View>
            <FieldLabel>{t("profile.about")}</FieldLabel>
            <Field value={about} onChangeText={setAbout} multiline maxLength={2000} placeholder={t("profile.aboutPlaceholder")} accessibilityLabel={t("profile.about")} style={{ height: 120, paddingTop: 14, textAlignVertical: "top" }} />
            <VoiceInput value={about} onChange={setAbout} maxLength={2000} context="a short description of a supplier business" style={{ marginTop: 8 }} />
          </View>
          <View>
            <FieldLabel>{t("profile.whatsapp")}</FieldLabel>
            <Field value={whatsapp} onChangeText={setWhatsapp} maxLength={20} keyboardType="phone-pad" placeholder="0803 123 4567" accessibilityLabel={t("profile.whatsapp")} />
          </View>
          <View>
            <FieldLabel>{t("profile.website")}</FieldLabel>
            <Field value={website} onChangeText={setWebsite} maxLength={200} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="www.yourbusiness.com" accessibilityLabel={t("profile.website")} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
