import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { Card, Chip, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { useLoad } from "@/lib/useLoad";
import { deleteVideo, fetchVideos } from "@/lib/video";
import { countByStatus, firstTab, readPurpose, readStatus, videoCover, videoPurposesFor, videosIn, videoWithoutShop, VIDEO_STATUSES, type VideoPurpose, type VideoRow, type VideoStatus } from "@/lib/video-pure";
import { useRole } from "@/lib/role";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Video studio (web /home/video): start a video for an ad, a product or social media, then drafts (they save
// themselves), saved and published videos. Drafts open the studio; saved videos open to play and share. Delivery
// partners (from Rex Studio) get the same screen with ad and social videos only: they have no products.

const PURPOSE_ICON: Record<VideoPurpose, AppIconName> = { ad: "megaphone", product: "tag", social: "share" };

export default function VideoHub() {
  const t = useT("m_video", "video", "m_ui");
  const { role } = useRole();
  const partner = videoWithoutShop(role);
  const videos = useLoad(fetchVideos);
  const [tab, setTab] = useState<VideoStatus | null>(null);
  const [removing, setRemoving] = useState<VideoRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = videos.data ?? [];
  const active = tab ?? firstTab(rows);
  const counts = countByStatus(rows);
  const shown = videosIn(rows, active);

  function open(row: VideoRow) {
    if (readStatus(row.status) === "draft" || !row.videoUrl) router.push({ pathname: "/video/studio", params: { id: row.id } });
    else router.push({ pathname: "/video/[id]", params: { id: row.id } });
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteVideo(removing.id);
      videos.setData((list) => (list ?? []).filter((item) => item.id !== removing.id));
      setRemoving(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("delete.problem"));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("title")} sub={partner ? t("partner.hubSub") : t("hub.subShort")} tip={partner ? undefined : t("hub.sub")} refreshing={videos.refreshing} onRefresh={() => void videos.refresh()}>
      <SectionTitle>{t("hub.create")}</SectionTitle>
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21, marginTop: -6 }}>{t("hub.createHint")}</T>
      {videoPurposesFor(role).map((purpose) => (
        <ChoiceRow
          key={purpose}
          icon={PURPOSE_ICON[purpose]}
          tint={purpose === "ad" ? colors.mintTint : purpose === "product" ? colors.peach : colors.lilac}
          title={t(`hub.purpose.${purpose}`)}
          sub={partner && purpose === "ad" ? t("partner.adHint") : t(`hub.purpose.${purpose}Hint`)}
          onPress={() => router.push({ pathname: "/video/studio", params: { purpose } })}
        />
      ))}

      <SectionTitle style={{ marginTop: 8 }}>{t("hub.yourVideos")}</SectionTitle>
      <ChipRow>
        {VIDEO_STATUSES.map((status) => (
          <Chip key={status} label={`${t(`hub.tab.${status}`)} ${counts[status]}`} on={active === status} onPress={() => setTab(status)} />
        ))}
      </ChipRow>

      {notice ? <Notice>{notice}</Notice> : null}
      {videos.loading && !videos.data ? <LoadingBlock /> : null}
      {videos.error && !videos.data ? <ErrorState message={videos.error} onRetry={() => void videos.reload()} /> : null}
      {videos.data && !shown.length ? (
        <EmptyState icon="play" title={t(`empty.${active}.title`)}>{partner && active === "published" ? t("partner.emptyPublished") : t(`empty.${active}.body`)}</EmptyState>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {shown.map((row) => {
          const cover = videoCover(row);
          const purpose = readPurpose(row.purpose);
          return (
            <View key={row.id} style={{ width: "47.5%", flexGrow: 1, maxWidth: "50%" }}>
              <Card style={{ padding: 0, overflow: "hidden", gap: 0 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={t("hub.openVideo", { title: row.title })} onPress={() => open(row)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                  <View style={{ aspectRatio: 3 / 4, backgroundColor: colors.inkFill }}>
                    {cover ? <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <AppIcon name="image" size={28} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={{ position: "absolute", top: 8, left: 8 }}>
                      <Badge label={t(`hub.purpose.${purpose}`)} bg="rgba(255,255,255,0.92)" />
                    </View>
                    {row.videoUrl ? (
                      <View style={{ position: "absolute", bottom: 8, left: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                        <AppIcon name="play" size={15} color="#FFFFFF" />
                      </View>
                    ) : null}
                    {row.seconds ? (
                      <View style={{ position: "absolute", bottom: 8, right: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3 }}>
                        <T weight="bold" style={{ color: "#FFFFFF", fontSize: 12 }}>{t("hub.seconds", { seconds: Math.round(row.seconds) })}</T>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ padding: 10, gap: 2 }}>
                    <T weight="extrabold" style={{ fontSize: 14.5 }} numberOfLines={2}>{row.title}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 13 }}>{friendlyDay(row.updatedAt, new Date(), t)}</T>
                  </View>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingBottom: 6 }}>
                  <PillButton size="sm" tone="white" title={readStatus(row.status) === "draft" ? t("hub.continue") : t("hub.open")} onPress={() => open(row)} style={{ flex: 1 }} />
                  <Pressable accessibilityRole="button" accessibilityLabel={t("hub.delete", { title: row.title })} hitSlop={6} onPress={() => setRemoving(row)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name="x" size={18} color={colors.inkSoft} />
                  </Pressable>
                </View>
              </Card>
            </View>
          );
        })}
      </View>

      <Sheet visible={Boolean(removing)} onClose={() => setRemoving(null)} title={t("delete.title")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("delete.body", { title: removing?.title ?? "" })}</T>
        <PillButton title={t("delete.yes")} busy={busy} style={{ backgroundColor: colors.dangerFill }} onPress={() => void remove()} />
        <LinkButton title={t("delete.keep")} onPress={() => setRemoving(null)} />
      </Sheet>
    </Screen>
  );
}
