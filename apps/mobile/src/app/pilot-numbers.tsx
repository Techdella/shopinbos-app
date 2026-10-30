import { naira } from "@shared/onboarding";
import { formatNumber } from "@shared/i18n";
import { List, Row, Tile } from "@/components/design";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { T } from "@/components/ui";
import { fetchPilotNumbers, usePilotNumbersOn } from "@/lib/pilot-numbers";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Pilot numbers (web /home/pilot-numbers; shared/pilot-numbers.ts): visits from the shop's link and QR code, Plug
// joins (from when Plug launches), followers, repeat buyers, resell sales and the top videos. Only for shops a pilot
// feature (post_to_plug, resell, notify_followers, plug_follow_card) is on for.

export default function PilotNumbersScreen() {
  const on = usePilotNumbersOn();
  const t = useT("pilotNumbers");
  const locale = useLocale();
  const loaded = useLoad(fetchPilotNumbers);
  const data = loaded.data;
  const count = (value: number) => formatNumber(value, locale);

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {!on ? <EmptyState icon="lock" title={t("off")} /> : null}
      {on && loaded.loading && !data ? <LoadingBlock /> : null}
      {on && loaded.error && !data ? <ErrorState message={loaded.error || t("loadFailed")} onRetry={() => void loaded.reload()} /> : null}
      {on && data ? (
        <>
          <SectionTitle>{t("visits.title")}</SectionTitle>
          <List>
            <Row lead={<Tile icon="link" tone="mint" />} title={t("visits.days7")} sub={t("visits.split", { link: count(data.visits.link7), qr: count(data.visits.qr7) })} right={<T weight="extrabold" style={{ fontSize: 16 }}>{count(data.visits.total7)}</T>} />
            <Row lead={<Tile icon="link" tone="sky" />} title={t("visits.days30")} sub={t("visits.split", { link: count(data.visits.link30), qr: count(data.visits.qr30) })} right={<T weight="extrabold" style={{ fontSize: 16 }}>{count(data.visits.total30)}</T>} />
            <Row lead={<Tile icon="users" tone="lilac" />} title={t("plug.title")} sub={data.plugLive ? undefined : t("plug.soon")} right={<T weight="extrabold" style={{ fontSize: 16 }}>{data.plugLive ? count(data.plugJoins) : "–"}</T>} />
          </List>

          <List>
            <Row lead={<Tile icon="users" tone="peach" />} title={t("followers.title")} sub={t("followers.fromLinks", { count: count(data.followers.fromLink + data.followers.fromQr) })} right={<T weight="extrabold" style={{ fontSize: 16 }}>{count(data.followers.total)}</T>} />
            <Row lead={<Tile icon="bag" tone="butter" />} title={t("buyers.title")} sub={t("buyers.of", { repeat: count(data.buyers.repeat), buyers: count(data.buyers.buyers) })} right={<T weight="extrabold" style={{ fontSize: 16 }}>{count(data.buyers.repeat)}</T>} />
            <Row
              lead={<Tile icon="share" tone="ok" />}
              title={t("resell.title")}
              sub={`${t("resell.value", { amount: naira(data.resell.value) })} · ${t("resell.commission", { amount: naira(data.resell.commission) })}`}
              right={<T weight="extrabold" style={{ fontSize: 15 }}>{t("resell.sales", { count: data.resell.sales })}</T>}
            />
          </List>

          <SectionTitle>{t("videos.title")}</SectionTitle>
          <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("videos.totalViews", { count: data.videoViews })}</T>
          {data.videos.length ? (
            <List>
              {data.videos.map((video) => (
                <Row
                  key={video.id}
                  lead={<Tile icon="video" tone="gray" />}
                  title={video.productName || video.caption || "—"}
                  sub={t("videos.orders", { count: video.ordersSince })}
                  right={<T weight="extrabold" style={{ fontSize: 14 }}>{t("videos.views", { count: video.views })}</T>}
                />
              ))}
            </List>
          ) : (
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("videos.empty")}</T>
          )}
          <T style={{ color: colors.inkSoft, fontSize: 12.5, lineHeight: 18 }}>{t("videos.note")}</T>
        </>
      ) : null}
    </Screen>
  );
}
