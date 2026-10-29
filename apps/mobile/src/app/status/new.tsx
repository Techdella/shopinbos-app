import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Choice, Pill, Sub, TILE, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Field, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { postStatus, uploadStatusImage, type StatusCtaKind } from "@/lib/familiar";
import { familiarRole, STATUS_CAPTION_MAX, STATUS_HEADLINE_MAX, statusHeadline, statusPicks } from "@/lib/familiar-pure";
import { sharePost } from "@/lib/familiar-share";
import { homeFor } from "@/lib/partner-pure";
import { fetchSupplierProducts } from "@/lib/supplier";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { formatMoney } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Post a status (24 hours, seen by other businesses on Shopinbos), "Familiar app" prototype `statusNew` and
// `statusDone`. Suppliers show sellers new stock (pick one of their products), delivery partners tell sellers about
// their routes, sellers say what they need ("Looking for a Lagos partner"). An optional photo, and "Also share to my
// WhatsApp Status" opens the phone's share sheet afterwards. POST /api/mobile/status; +15 points when rewards are on.

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };

export default function NewStatus() {
  const t = useT("m_familiar");
  const locale = useLocale();
  const { role } = useRole();
  const who = familiarRole(role);
  const roleKey = who === "logistics_partner" ? "partner" : who;
  const products = useLoad(async () => (who === "supplier" ? fetchSupplierProducts().catch(() => []) : []), who);
  const picks = statusPicks(who);
  const [pick, setPick] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [toWhatsApp, setToWhatsApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<{ reward: { points: number; streak: number } | null } | null>(null);

  const product = products.data?.find((item) => item.id === productId) ?? null;
  const pickWords = (key: string) => t.dynamic(`sn.pick.${roleKey}.${key}`, key);
  const headline = statusHeadline(
    product ? t("sn.newStock", { name: product.name }) : pick && pick !== "other" ? pickWords(pick) : said,
    pick && pick !== "other" ? pickWords(pick) : "",
  );
  // When the headline is the person's own words, they aren't repeated as the caption.
  const usesSaid = !product && (!pick || pick === "other");
  const caption = usesSaid ? "" : said.trim();
  const ready = Boolean(headline.trim()) && !busy;

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      setProblem(t("sn.photoPermission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }).catch(() => null);
    const asset = result && !result.canceled ? result.assets[0] : null;
    if (asset) {
      setPhoto({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      setProblem(null);
    }
  };

  const post = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      let imageUrl: string | undefined;
      if (photo) imageUrl = (await uploadStatusImage(photo)).url;
      const tone = (picks.find((item) => item.key === pick)?.tone ?? (who === "supplier" ? "peach" : "mint"));
      const ctaKind: StatusCtaKind = who === "supplier" ? (product ? "add_product" : "chat") : who === "logistics_partner" ? "see_rates" : "chat";
      const result = await postStatus({
        headline: headline.slice(0, STATUS_HEADLINE_MAX),
        caption: caption ? caption.slice(0, STATUS_CAPTION_MAX) : undefined,
        imageUrl,
        tone,
        productId: product?.id,
        ctaKind,
      });
      setDone({ reward: result.reward });
      if (toWhatsApp) {
        const picture = imageUrl ?? result.post.imageUrl ?? result.post.product?.image ?? product?.images[0] ?? null;
        await sharePost({ imageUrl: picture, caption: [headline, caption].filter(Boolean).join("\n"), target: "whatsapp_status", title: t("share.title") }).catch(() => false);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 501)) setProblem(t("sn.failed"));
      else setProblem(error instanceof Error ? error.message : t("sn.failed"));
    } finally {
      setBusy(false);
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace(homeFor(role) as never));

  if (done) {
    return (
      <Screen title={t("sn.title")} help={false} onBack={leave} footer={<PillButton title={t("sn.done")} onPress={leave} />}>
        <View style={{ alignItems: "center", gap: 14, paddingTop: 48 }} accessibilityLiveRegion="polite">
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.successFill, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={40} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Title style={{ textAlign: "center" }}>{t("sn.live")}</Title>
          <Sub style={{ textAlign: "center" }}>{t(`sn.doneText.${roleKey}`)}</Sub>
          {done.reward ? <Pill label={t("sn.reward", { points: done.reward.points, streak: done.reward.streak })} tone="org" icon="star" /> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t("sn.title")}
      footer={
        <PillButton tone="accent" busy={busy} disabled={!ready} onPress={() => void post()} accessibilityLabel={t("sn.post")} icon="send" title={t("sn.post")} />
      }
    >
      <View style={{ backgroundColor: TILE.lime.bg, borderRadius: 24, padding: 18, gap: 4 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t(`sn.heading.${roleKey}`)}</T>
        <T style={{ fontSize: 14.5, lineHeight: 20, color: colors.ink }}>{t(`sn.hint.${roleKey}`)}</T>
      </View>

      {who === "supplier" ? (
        <View style={{ gap: 10 }}>
          <T weight="bold" style={{ fontSize: 15 }}>{t("sn.pickProduct")}</T>
          {products.loading && !products.data ? <LoadingBlock /> : null}
          {products.data && !products.data.length ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("sn.noProducts")}</T> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(products.data ?? []).slice(0, 8).map((item) => {
              const on = item.id === productId;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${item.name}, ${formatMoney(item.wholesalePrice, locale)}`}
                  onPress={() => setProductId(on ? null : item.id)}
                  style={{ width: "48%", flexGrow: 1, borderRadius: 20, overflow: "hidden", borderWidth: on ? 3 : 1, borderColor: on ? colors.accent : colors.line, backgroundColor: colors.surface }}
                >
                  {item.images[0] ? <Image source={{ uri: item.images[0] }} style={{ width: "100%", aspectRatio: 1.2, backgroundColor: colors.grayTint }} contentFit="cover" /> : <View style={{ width: "100%", aspectRatio: 1.2, backgroundColor: colors.grayTint }} />}
                  <View style={{ padding: 10, gap: 2 }}>
                    <T weight="bold" numberOfLines={1} style={{ fontSize: 14 }}>{item.name}</T>
                    <T style={{ fontSize: 13, color: colors.inkSoft }}>{t("sn.toShops", { price: formatMoney(item.wholesalePrice, locale) })}</T>
                  </View>
                  {on ? (
                    <View style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                      <AppIcon name="check" size={15} color={colors.onAccent} strokeWidth={3} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }} accessibilityRole="radiogroup">
          <T weight="bold" style={{ fontSize: 15 }}>{t(`sn.pickLabel.${roleKey}`)}</T>
          {picks.map((item) => (
            <Choice key={item.key} title={pickWords(item.key)} on={pick === item.key} onPress={() => setPick(pick === item.key ? null : item.key)} />
          ))}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <T weight="bold" style={{ fontSize: 15 }}>{t("sn.say")}</T>
        <Field
          value={said}
          onChangeText={setSaid}
          placeholder={t(`sn.sayHint.${roleKey}`)}
          multiline
          maxLength={usesSaid ? STATUS_HEADLINE_MAX : STATUS_CAPTION_MAX}
          accessibilityLabel={t("sn.say")}
          style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }}
        />
      </View>

      {photo ? (
        <View style={{ gap: 8 }}>
          <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 200, borderRadius: 24, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={t("sn.photo")} />
          <PillButton title={t("sn.removePhoto")} tone="white" size="sm" onPress={() => setPhoto(null)} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : (
        <PillButton tone="white" size="md" onPress={() => void choosePhoto()} accessibilityLabel={t("sn.addPhoto")} icon="camera" title={t("sn.addPhoto")} />
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, minHeight: 64 }}>
        <T weight="bold" style={{ flex: 1, fontSize: 15.5 }}>{t("sn.alsoWhatsApp")}</T>
        <Toggle on={toWhatsApp} onChange={setToWhatsApp} label={t("sn.alsoWhatsApp")} />
      </View>

      {problem ? <Notice>{problem}</Notice> : null}
    </Screen>
  );
}
