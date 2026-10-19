import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { BRAND_LOOKS, BRAND_PALETTES, suggestShopNames } from "@shared/onboarding";
import { Chip, Field, Mascot, Notice, PillButton, T } from "@/components/ui";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { saveMemory, saveStoreName } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";

export default function Brand() {
  const t = useT("m_onboarding");
  const { start } = useLocalSearchParams<{ start?: string }>();
  const { status, setStatus, description, palette, setPalette, look, setLook, startBuild } = useOnboarding();
  const ideas = useMemo(() => {
    const fromRex = status?.memory?.storeName && status.memory.storeName !== "Your Store" ? [status.memory.storeName] : [];
    return Array.from(new Set([...fromRex, ...suggestShopNames(status?.ownerName ?? "", description)])).slice(0, 3);
  }, [status, description]);
  const [name, setName] = useState("");
  const [custom, setCustom] = useState(false);
  const [tweak, setTweak] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fallback is saved as the shop's name (shoppers see it), so it stays as it is.
  const resolved = (custom ? name : name || ideas[0] || "My Shop").trim() || ideas[0] || "My Shop";

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveStoreName(resolved);
      if (status) setStatus({ ...status, store: { ...status.store, name: saved.name, slug: saved.slug } });
      const [primary, accent, background] = palette.swatches;
      await saveMemory({ storeName: resolved, templateId: look.templateId, palette: { id: palette.key, name: palette.label, colors: { primary, accent, background } }, screen: "products" }).catch(() => null);
      void startBuild(resolved, tweak.trim() || undefined);
      router.push({ pathname: "/onboarding/products", params: { door: start === "find" ? "sup" : "snap" } });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("brand.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      step="brand"
      footer={
        <>
          {error && <View style={{ marginBottom: 10 }}><Notice>{error}</Notice></View>}
          <PillButton title={t("brand.looksGood")} busy={busy} onPress={() => void confirm()} />
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mascot name="rex" size={56} />
        <T weight="extrabold" style={{ flex: 1, fontSize: 26, lineHeight: 29, letterSpacing: -0.5 }} accessibilityRole="header">{t("brand.title")}</T>
      </View>
      <T weight="bold" style={{ fontSize: 15, marginTop: 24, marginBottom: 10 }}>{t("brand.shopName")}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ideas.map((idea) => <Chip key={idea} label={idea} on={!custom && resolved === idea} onPress={() => { setCustom(false); setName(idea); }} />)}
        <Chip label={t("brand.typeOwn")} on={custom} onPress={() => setCustom(true)} />
      </View>
      {custom && <Field style={{ marginTop: 12 }} autoFocus placeholder={t("brand.namePlaceholder")} value={name} onChangeText={setName} maxLength={60} />}
      <T weight="bold" style={{ fontSize: 15, marginTop: 24, marginBottom: 10 }}>{t("brand.colours")}</T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {BRAND_PALETTES.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={t.dynamic(`palette.${item.key}`, item.label)} accessibilityState={{ selected: palette.key === item.key }} onPress={() => setPalette(item)} style={{ flex: 1, flexDirection: "row", gap: 6, padding: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 2, borderColor: palette.key === item.key ? colors.accent : "transparent" }}>
            {item.swatches.map((swatch) => <View key={swatch} style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: swatch, borderWidth: 1, borderColor: "rgba(22,20,31,0.06)" }} />)}
          </Pressable>
        ))}
      </View>
      <T weight="bold" style={{ fontSize: 15, marginTop: 24, marginBottom: 10 }}>{t("brand.look")}</T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {BRAND_LOOKS.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: look.key === item.key }} onPress={() => setLook(item)} style={{ flex: 1, height: 216, borderRadius: 18, padding: 8, backgroundColor: item.background, borderWidth: 2, borderColor: look.key === item.key ? colors.accent : "transparent" }}>
            <T weight="semibold" style={{ color: item.ink, fontSize: 15, lineHeight: 17, padding: 4, fontFamily: item.fontStyle === "fraunces" ? undefined : fonts.bold }}>{resolved}</T>
            <View style={{ flex: 1, gap: 6, marginTop: 6, borderRadius: 8, padding: 6, backgroundColor: "rgba(255,255,255,0.55)" }}>
              <View style={{ height: "46%", borderRadius: 6, backgroundColor: palette.swatches[1] }} />
              <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
                <View style={{ flex: 1, borderRadius: 6, backgroundColor: palette.swatches[0], opacity: 0.85 }} />
                <View style={{ flex: 1, borderRadius: 6, backgroundColor: palette.swatches[2] }} />
              </View>
            </View>
            <T weight="bold" style={{ color: item.ink, fontSize: 14, paddingTop: 8, paddingHorizontal: 4 }}>{item.label}</T>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16, backgroundColor: colors.surface, borderRadius: radii.pill, paddingLeft: 20, paddingRight: 6, paddingVertical: 6 }}>
        <TextInput value={tweak} onChangeText={setTweak} placeholder={t("brand.tweakPlaceholder")} placeholderTextColor={colors.inkFaint} accessibilityLabel={t("brand.tweakLabel")} style={{ flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.ink, height: 40 }} />
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>
        </View>
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 13.5, marginTop: 8, paddingHorizontal: 4 }}>{t("brand.tweakNote")}</T>
    </OnboardingFrame>
  );
}
