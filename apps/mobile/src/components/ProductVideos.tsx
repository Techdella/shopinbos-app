import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { CAPTION_MAX, MAX_VIDEOS_PER_PRODUCT, POST_TO_PLUG, PRODUCT_VIDEO_MAX_MS, shouldWarnNotVertical, type OwnerKind } from "@shared/product-videos";
import { clockLabel, pickerDurationMs } from "@shared/status-video";
import { Eyebrow, Pill } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Card, Field, Notice, PillButton, T, Toggle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useFeature } from "@/lib/features";
import { useT } from "@/lib/i18n";
import {
  fetchProductVideos,
  pickedProductVideoProblem,
  postProductVideo,
  postRexVideo,
  removeProductVideo,
  updateProductVideo,
  type ProductVideo,
  type ProductVideos as Loaded,
  type RexReel,
  type VideoInput,
} from "@/lib/product-videos";
import { colors } from "@/theme";

// "Videos" on a product (Post to Plug pilot): the seller's product screen (app/product/[id]) and the supplier's
// (app/supplier/product/[id]). Only shows while post_to_plug is on for this account on this app (useFeature). Pick or
// record a short video (≤ 60 s; iPhones trim on pick), or use a finished Rex video (shops); add a caption and "Show on
// Plug Discover" (on by default); then hide, show or remove each one. Same API and rules as the web
// (lib/product-videos.ts, shared/product-videos.ts).

/** Picker options: at most 60 s, compressed to 720p where the phone can (iOS trims on pick). */
const VIDEO_PICK: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["videos"],
  videoMaxDuration: PRODUCT_VIDEO_MAX_MS / 1000,
  allowsEditing: true,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  quality: 0.7,
};

type Picked = VideoInput & { width: number | null; height: number | null };
type Draft = { kind: "file"; video: Picked } | { kind: "rex"; reel: RexReel };

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (created) => {
    created.staysActiveInBackground = false;
    created.play();
  });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", aspectRatio: 9 / 16, maxHeight: 520, borderRadius: 18, backgroundColor: "#000000", overflow: "hidden" }} />;
}

function Thumb({ uri, onPress, label }: { uri: string | null; onPress?: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={!onPress} style={{ width: 72, aspectRatio: 9 / 16, borderRadius: 12, overflow: "hidden", backgroundColor: "#111111", alignItems: "center", justifyContent: "center" }}>
      {uri ? <Image source={{ uri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" /> : null}
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" }}>
        <AppIcon name="play" size={14} color="#111111" />
      </View>
    </Pressable>
  );
}

export function ProductVideosCard({ ownerKind, productId }: { ownerKind: OwnerKind; productId: string }) {
  const on = useFeature(POST_TO_PLUG);
  if (!on) return null;
  return <VideosCard ownerKind={ownerKind} productId={productId} />;
}

function VideosCard({ ownerKind, productId }: { ownerKind: OwnerKind; productId: string }) {
  const t = useT("productVideos");
  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState("");
  const [discover, setDiscover] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [rexOpen, setRexOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const loaded = await fetchProductVideos(productId);
      setData(loaded);
      setDiscover(loaded.showOnDiscoverDefault);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const words = { tooBig: t("tooBig"), tooLong: t("tooLong"), type: t("wrongType") };
  const message = (error: unknown) => (error instanceof ApiError || (error instanceof Error && error.message && !/^\d+$|offline|failed/i.test(error.message)) ? (error as Error).message : t("failed"));

  const take = (asset: ImagePicker.ImagePickerAsset | null) => {
    if (!asset) return;
    const video: Picked = { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName, fileSize: asset.fileSize, duration: asset.duration, width: asset.width || null, height: asset.height || null };
    const why = pickedProductVideoProblem(video);
    if (why) {
      setNotice({ tone: "error", text: why === "too_big" ? words.tooBig : why === "too_long" ? words.tooLong : words.type });
      return;
    }
    setNotice(null);
    setCaption("");
    setDraft({ kind: "file", video });
  };

  const choose = async (camera: boolean) => {
    const permission = await (camera ? ImagePicker.requestCameraPermissionsAsync() : ImagePicker.requestMediaLibraryPermissionsAsync()).catch(() => null);
    if (!permission?.granted) return;
    const result = await (camera ? ImagePicker.launchCameraAsync(VIDEO_PICK) : ImagePicker.launchImageLibraryAsync(VIDEO_PICK)).catch(() => null);
    take(result && !result.canceled ? result.assets[0] ?? null : null);
  };

  const post = async () => {
    if (!draft) return;
    setBusy("post");
    setNotice(null);
    try {
      if (draft.kind === "rex") await postRexVideo(productId, draft.reel.id, { caption, showOnDiscover: discover });
      else await postProductVideo(productId, draft.video, { caption, showOnDiscover: discover }, (fraction) => setPercent(Math.round(fraction * 100)), words);
      setDraft(null);
      setNotice({ tone: "success", text: t("saved") });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: message(error) });
    } finally {
      setPercent(null);
      setBusy(null);
    }
  };

  const change = async (video: ProductVideo, patch: { caption?: string; showOnDiscover?: boolean; status?: "active" | "hidden" }) => {
    setBusy(video.id);
    try {
      const next = await updateProductVideo(video.id, patch);
      setData((current) => (current ? { ...current, videos: current.videos.map((row) => (row.id === video.id ? next : row)) } : current));
      if (patch.caption !== undefined) setCaptions(({ [video.id]: _gone, ...rest }) => rest);
    } catch (error) {
      setNotice({ tone: "error", text: message(error) });
    } finally {
      setBusy(null);
    }
  };

  const remove = (video: ProductVideo) => {
    Alert.alert(t("remove"), t("removeConfirm"), [
      { text: t("keep"), style: "cancel" },
      {
        text: t("removeYes"),
        style: "destructive",
        onPress: () => {
          setBusy(video.id);
          void removeProductVideo(video.id)
            .then(() => setData((current) => (current ? { ...current, videos: current.videos.filter((row) => row.id !== video.id) } : current)))
            .catch((error: unknown) => setNotice({ tone: "error", text: message(error) }))
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  const full = (data?.videos.length ?? 0) >= MAX_VIDEOS_PER_PRODUCT;
  const durationMs = draft?.kind === "file" ? pickerDurationMs(draft.video.duration) : null;

  return (
    <Card style={{ gap: 12 }}>
      <View testID="product-videos" style={{ gap: 4 }}>
        <Eyebrow>{t("section.eyebrow")}</Eyebrow>
        <T weight="extrabold" style={{ fontSize: 18 }}>{t("section.title")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{ownerKind === "supplier" ? t("section.subSupplier") : t("section.sub")}</T>
      </View>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loadFailed ? <Notice>{t("loadFailed")}</Notice> : null}

      {!draft ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <PillButton title={t("upload")} icon="video" size="sm" disabled={!data || full || Boolean(busy)} onPress={() => void choose(false)} />
          <PillButton title={t("record")} icon="camera" tone="white" size="sm" disabled={!data || full || Boolean(busy)} onPress={() => void choose(true)} />
          {ownerKind === "store" ? <PillButton title={t("pickRex")} tone="white" size="sm" disabled={!data || full || Boolean(busy)} onPress={() => setRexOpen(true)} /> : null}
        </View>
      ) : null}
      {full ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("limit", { count: MAX_VIDEOS_PER_PRODUCT })}</T> : null}

      {draft ? (
        <View style={{ gap: 10, backgroundColor: colors.grayTint, borderRadius: 18, padding: 14 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Thumb uri={draft.kind === "rex" ? draft.reel.posterUrl : null} label={t("shop.play", { number: 1 })} onPress={() => setPlaying(draft.kind === "rex" ? draft.reel.videoUrl : draft.video.uri)} />
            <View style={{ flex: 1, gap: 4 }}>
              {draft.kind === "rex" ? <T weight="bold">{t("fromRex")}: {draft.reel.title}</T> : null}
              {durationMs ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("length", { clock: clockLabel(durationMs) })}</T> : null}
            </View>
          </View>
          {draft.kind === "file" && shouldWarnNotVertical(draft.video.width, draft.video.height) ? <Notice tone="info">{t("notVertical")}</Notice> : null}
          <Field value={caption} onChangeText={setCaption} maxLength={CAPTION_MAX} placeholder={t("captionPlaceholder")} accessibilityLabel={t("caption")} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold">{t("discover")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 18 }}>{discover ? t("discoverSub") : t("discoverOff")}</T>
            </View>
            <Toggle on={discover} onChange={setDiscover} label={t("discover")} />
          </View>
          {percent !== null ? <T weight="semibold">{t("uploading", { percent })}</T> : busy === "post" ? <T weight="semibold">{t("checking")}</T> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PillButton title={t("post")} tone="accent" size="md" busy={busy === "post"} onPress={() => void post()} />
            <PillButton title={t("cancel")} tone="white" size="md" disabled={busy === "post"} onPress={() => setDraft(null)} />
          </View>
        </View>
      ) : null}

      {data && !data.videos.length && !draft ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("empty")}</T> : null}

      {data?.videos.map((video) => {
        const text = captions[video.id] ?? video.caption;
        return (
          <View key={video.id} style={{ flexDirection: "row", gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}>
            <Thumb uri={video.posterUrl} label={t("shop.play", { number: 1 })} onPress={() => setPlaying(video.videoUrl)} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Pill label={video.status === "active" ? t("status.active") : t("status.hidden")} tone={video.status === "active" ? "ok" : "gray"} />
                {video.durationMs ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{clockLabel(video.durationMs)}</T> : null}
              </View>
              <Field value={text} onChangeText={(value) => setCaptions((current) => ({ ...current, [video.id]: value }))} maxLength={CAPTION_MAX} placeholder={t("captionPlaceholder")} accessibilityLabel={t("caption")} />
              {text !== video.caption ? <PillButton title={t("saveCaption")} size="sm" busy={busy === video.id} onPress={() => void change(video, { caption: text })} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <T weight="semibold" style={{ flex: 1, fontSize: 14 }}>{t("discover")}</T>
                <Toggle on={video.showOnDiscover} onChange={(next) => void change(video, { showOnDiscover: next })} label={t("discover")} />
              </View>
              {video.showOnDiscover ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("views", { count: video.views })}</T> : null}
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <PillButton title={video.status === "active" ? t("hide") : t("show")} tone="white" size="sm" disabled={busy === video.id} onPress={() => void change(video, { status: video.status === "active" ? "hidden" : "active" })} />
                <PillButton title={t("remove")} tone="white" size="sm" disabled={busy === video.id} onPress={() => remove(video)} />
              </View>
            </View>
          </View>
        );
      })}

      <Sheet visible={rexOpen} onClose={() => setRexOpen(false)} title={t("rexTitle")}>
        {data?.rex.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {data.rex.map((reel) => (
              <Pressable
                key={reel.id}
                accessibilityRole="button"
                accessibilityLabel={`${t("rexUse")}: ${reel.title}`}
                onPress={() => {
                  setRexOpen(false);
                  setCaption("");
                  setDraft({ kind: "rex", reel });
                }}
                style={{ width: 120, gap: 4 }}
              >
                <View style={{ width: 120, aspectRatio: 9 / 16, borderRadius: 14, overflow: "hidden", backgroundColor: "#111111" }}>
                  {reel.posterUrl ? <Image source={{ uri: reel.posterUrl }} style={{ flex: 1 }} contentFit="cover" /> : null}
                </View>
                <T weight="semibold" numberOfLines={1} style={{ fontSize: 13 }}>{reel.title}</T>
                {reel.seconds ? <T style={{ color: colors.inkSoft, fontSize: 12 }}>{t("rexSeconds", { seconds: Math.round(reel.seconds) })}</T> : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <T style={{ color: colors.inkSoft }}>{t("rexEmpty")}</T>
        )}
      </Sheet>

      <Sheet visible={playing !== null} onClose={() => setPlaying(null)} title={t("section.title")}>
        {playing ? <Player url={playing} /> : null}
      </Sheet>
    </Card>
  );
}
