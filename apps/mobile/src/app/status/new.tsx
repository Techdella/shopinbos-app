import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Choice, Pill, Sub, TILE, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Field, Notice, PillButton, Segmented, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { postStatus, uploadStatusImage, type StatusCtaKind } from "@/lib/familiar";
import { familiarRole, STATUS_CAPTION_MAX, STATUS_HEADLINE_MAX, statusHeadline, statusPicks } from "@/lib/familiar-pure";
import { sharePost } from "@/lib/familiar-share";
import { pickedVideoProblem, uploadStatusVideo, type VideoInput } from "@/lib/status-video";
import { clockLabel, pickerDurationMs, STATUS_VIDEO_MAX_MS } from "@shared/status-video";
import { homeFor } from "@/lib/partner-pure";
import { fetchSupplierProducts } from "@/lib/supplier";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { formatMoney } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors, surfaceCard } from "@/theme";

// Post a status (24 hours, seen by other businesses on Shopinbos), "Familiar app" prototype `statusNew` and
// `statusDone`. Suppliers show sellers new stock (pick one of their products), delivery partners tell sellers about
// their routes, sellers say what they need ("Looking for a Lagos partner"). An optional photo, and "Also share to my
// WhatsApp Status" opens the phone's share sheet afterwards. POST /api/mobile/status; +15 points when rewards are on.
// "Photo or video": a short video (up to 30 s, picked or recorded, trimmed and compressed by the picker) goes straight
// to Storage with a signed URL (lib/status-video.ts) with a poster frame. ?kind=video opens with Video chosen (the
// "Post a video" button on Shopinbos's video statuses).

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };
type Media = "photo" | "video";

/** Picker options for a status video: at most 30 s, compressed to 720p where the phone can (iOS trims on pick). */
const VIDEO_PICK: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["videos"],
  videoMaxDuration: STATUS_VIDEO_MAX_MS / 1000,
  allowsEditing: true,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  quality: 0.7,
};

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
  const params = useLocalSearchParams<{ kind?: string }>();
  const [media, setMedia] = useState<Media>(params.kind === "video" ? "video" : "photo");
  const [video, setVideo] = useState<VideoInput | null>(null);
  const [sent, setSent] = useState<number | null>(null);
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

  const videoWords = () => ({ tooBig: t("sn.videoTooBig"), tooLong: t("sn.videoTooLong"), type: t("sn.videoType") });

  /** Takes a picked or recorded video when it fits (30 s, 25 MB, MP4 / MOV); says why not otherwise. */
  const takeVideo = (asset: ImagePicker.ImagePickerAsset | null) => {
    if (!asset) return;
    const input: VideoInput = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize, duration: asset.duration };
    const why = pickedVideoProblem(input);
    if (why) {
      setProblem(why === "too_big" ? t("sn.videoTooBig") : why === "too_long" ? t("sn.videoTooLong") : t("sn.videoType"));
      return;
    }
    setVideo(input);
    setPhoto(null);
    setProblem(null);
  };

  const chooseVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      setProblem(t("sn.photoPermission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(VIDEO_PICK).catch(() => null);
    takeVideo(result && !result.canceled ? result.assets[0] ?? null : null);
  };

  const recordVideo = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      setProblem(t("sn.cameraPermission"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync(VIDEO_PICK).catch(() => null);
    takeVideo(result && !result.canceled ? result.assets[0] ?? null : null);
  };

  const post = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      let imageUrl: string | undefined;
      let clip: Awaited<ReturnType<typeof uploadStatusVideo>> | null = null;
      if (media === "video" && video) {
        setSent(0);
        clip = await uploadStatusVideo(video, (fraction) => setSent(Math.round(fraction * 100)), videoWords());
      } else if (media === "photo" && photo) imageUrl = (await uploadStatusImage(photo)).url;
      const tone = (picks.find((item) => item.key === pick)?.tone ?? (who === "supplier" ? "peach" : "mint"));
      const ctaKind: StatusCtaKind = who === "supplier" ? (product ? "add_product" : "chat") : who === "logistics_partner" ? "see_rates" : "chat";
      const result = await postStatus({
        headline: headline.slice(0, STATUS_HEADLINE_MAX),
        caption: caption ? caption.slice(0, STATUS_CAPTION_MAX) : undefined,
        imageUrl,
        ...(clip ? { videoUrl: clip.videoUrl, posterUrl: clip.posterUrl, durationMs: clip.durationMs } : {}),
        tone,
        productId: product?.id,
        ctaKind,
      });
      setDone({ reward: result.reward });
      if (toWhatsApp) {
        const picture = imageUrl ?? result.post.imageUrl ?? clip?.posterUrl ?? result.post.product?.image ?? product?.images[0] ?? null;
        await sharePost({ imageUrl: picture, caption: [headline, caption].filter(Boolean).join("\n"), target: "whatsapp_status", title: t("share.title") }).catch(() => false);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 501)) setProblem(t("sn.failed"));
      else setProblem(error instanceof Error ? error.message : t("sn.failed"));
    } finally {
      setBusy(false);
      setSent(null);
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

      <View style={{ gap: 10 }} testID="status-media">
        <T weight="bold" style={{ fontSize: 15 }}>{t("sn.photoOrVideo")}</T>
        <Segmented<Media>
          options={[{ value: "photo", label: t("sn.mediaPhoto") }, { value: "video", label: t("sn.mediaVideo") }]}
          value={media}
          onChange={(next) => {
            setMedia(next);
            setProblem(null);
          }}
        />
        {media === "video" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AppIcon name="video" size={18} color={colors.inkSoft} />
            <T style={{ flex: 1, fontSize: 14, color: colors.inkSoft }}>{t("sn.videoHint")}</T>
          </View>
        ) : null}
        {media === "photo" ? (
          photo ? (
            <View style={{ gap: 8 }}>
              <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 200, borderRadius: 24, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityLabel={t("sn.photo")} />
              <PillButton title={t("sn.removePhoto")} tone="white" size="sm" onPress={() => setPhoto(null)} style={{ alignSelf: "flex-start" }} />
            </View>
          ) : (
            <PillButton tone="white" size="md" onPress={() => void choosePhoto()} accessibilityLabel={t("sn.addPhoto")} icon="camera" title={t("sn.addPhoto")} />
          )
        ) : video ? (
          <View style={{ gap: 8 }}>
            <View testID="status-video-picked" accessibilityLabel={t("sn.video")} style={{ height: 160, borderRadius: 24, backgroundColor: colors.inkFill, alignItems: "center", justifyContent: "center", gap: 10 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <View style={{ marginLeft: 4 }}>
                  <AppIcon name="play" size={28} color="#FFFFFF" />
                </View>
              </View>
              <T weight="bold" style={{ color: "#FFFFFF", fontSize: 15 }}>
                {t("sn.videoLength", { time: clockLabel(pickerDurationMs(video.duration)) })}
              </T>
              {sent != null ? <T style={{ color: "#FFFFFF", fontSize: 13 }} accessibilityLiveRegion="polite">{t("sn.uploading", { percent: sent })}</T> : null}
            </View>
            <PillButton title={t("sn.removeVideo")} tone="white" size="sm" disabled={busy} onPress={() => setVideo(null)} style={{ alignSelf: "flex-start" }} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <PillButton tone="white" size="md" onPress={() => void recordVideo()} accessibilityLabel={t("sn.recordVideo")} icon="video" title={t("sn.recordVideo")} />
            <PillButton tone="white" size="md" onPress={() => void chooseVideo()} accessibilityLabel={t("sn.pickVideo")} icon="image" title={t("sn.pickVideo")} />
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, ...surfaceCard(), paddingHorizontal: 16, minHeight: 64 }}>
        <T weight="bold" style={{ flex: 1, fontSize: 15.5 }}>{t("sn.alsoWhatsApp")}</T>
        <Toggle on={toWhatsApp} onChange={setToWhatsApp} label={t("sn.alsoWhatsApp")} />
      </View>

      {problem ? <Notice>{problem}</Notice> : null}
    </Screen>
  );
}
