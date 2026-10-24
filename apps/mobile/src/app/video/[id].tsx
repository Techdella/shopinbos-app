import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { saveProduct } from "@/lib/products";
import { shareText } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { deleteVideo, fetchVideo, patchVideo } from "@/lib/video";
import { publishedKinds, readConfig, readPurpose, readStatus, shareMessage } from "@/lib/video-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One saved video (web /home/video, a saved card): play it, share it, keep it on the phone, put it on the
// product's page or mark it posted, change it in the studio, or delete it. Running it as an ad is on the web.

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (created) => {
    created.loop = true;
  });
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      style={{ width: "100%", maxWidth: 320, alignSelf: "center", aspectRatio: 9 / 16, borderRadius: 18, backgroundColor: "#000000", overflow: "hidden" }}
    />
  );
}

export default function VideoDetail() {
  const t = useT("m_video", "video", "m_ui");
  const { id } = useLocalSearchParams<{ id: string }>();
  const video = useLoad(() => fetchVideo(id), id);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const row = video.data;

  // A draft has nothing to play yet: it opens in the studio.
  useEffect(() => {
    if (row && !row.videoUrl) router.replace({ pathname: "/video/studio", params: { id: row.id } });
  }, [row]);

  if (!row || !row.videoUrl) {
    return (
      <Screen title={t("watch.title")}>
        {video.error && !row ? <ErrorState message={video.error} onRetry={() => void video.reload()} /> : <LoadingBlock />}
      </Screen>
    );
  }

  const url = row.videoUrl;
  const purpose = readPurpose(row.purpose);
  const status = readStatus(row.status);
  const config = readConfig(row.config);
  const places = publishedKinds(row.publishedTo);
  const productName = config.name?.trim() || t("watch.theProduct");

  async function run(key: string, work: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    try {
      setNotice({ tone: "success", text: await work() });
      void video.reload();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("err.save") });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await deleteVideo(row!.id);
      setConfirm(false);
      if (router.canGoBack()) router.back();
      else router.replace("/video");
    } catch (error) {
      setConfirm(false);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("delete.problem") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={row.title}
      sub={[t(`hub.status.${status}`), friendlyDay(row.updatedAt, new Date(), t), row.seconds ? t("hub.seconds", { seconds: Math.round(row.seconds) }) : null].filter(Boolean).join(" · ")}
      footer={<PillButton title={t("watch.share")} onPress={() => void shareText(shareMessage(row.title, url))} />}
      refreshing={video.refreshing}
      onRefresh={() => void video.refresh()}
    >
      <Player url={url} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Badge label={t(`hub.purpose.${purpose}`)} bg={colors.peach} fg={colors.accentInk} />
        {places.map((place) => <Badge key={place} label={t("watch.on", { place: t(`hub.on.${place}`) })} bg={colors.mintTint} fg={colors.forest} />)}
      </View>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{t("watch.useIt")}</T>
        <PillButton size="md" tone="white" title={t("watch.save")} onPress={() => void WebBrowser.openBrowserAsync(url)} />
        <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("watch.saveHint")}</T>
        {row.productId ? (
          <PillButton
            size="md"
            tone="white"
            title={places.includes("product") ? t("watch.onProduct") : t("addTo", { name: productName })}
            busy={busy === "product"}
            disabled={Boolean(busy) || places.includes("product")}
            onPress={() =>
              void run("product", async () => {
                try {
                  await saveProduct(row.productId!, { videoUrl: url });
                } catch {
                  throw new Error(t("err.attach"));
                }
                await patchVideo(row.id, { published: { kind: "product", id: row.productId! } });
                return t("added", { name: productName });
              })
            }
          />
        ) : null}
        <PillButton
          size="md"
          tone="white"
          title={places.includes("social") ? t("watch.posted") : t("markPosted")}
          busy={busy === "social"}
          disabled={Boolean(busy) || places.includes("social")}
          onPress={() => void run("social", async () => {
            await patchVideo(row.id, { published: { kind: "social" } });
            return t("markedPosted");
          })}
        />
        <PillButton size="md" tone="white" title={t("watch.change")} disabled={Boolean(busy)} onPress={() => router.push({ pathname: "/video/studio", params: { id: row.id } })} />
      </Card>


      <LinkButton title={t("delete.button")} color={colors.danger} onPress={() => setConfirm(true)} />

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t("delete.title")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("delete.body", { title: row.title })}</T>
        <PillButton title={t("delete.yes")} busy={busy === "delete"} style={{ backgroundColor: colors.danger }} onPress={() => void remove()} />
        <LinkButton title={t("delete.keep")} onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
