"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { VideoPurpose, VideoStatus } from "@shared/video-projects";

export interface HubVideo {
  id: string;
  title: string;
  purpose: VideoPurpose;
  status: VideoStatus;
  videoUrl: string | null;
  cover: string | null;
  seconds: number | null;
  updatedAt: string;
  publishedTo: Array<"product" | "ad" | "social">;
}

const PURPOSE_ICON: Record<VideoPurpose, IconName> = { ad: "megaphone", product: "tag", social: "instagram" };
const card = "rounded-[22px] border border-app-line bg-white";

/** Start a video for an ad, a product or social media; then the seller's drafts, saved and published videos. */
export function VideoHub({ videos }: { videos: HubVideo[] }) {
  const t = useT("video");
  const locale = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<VideoStatus>(videos.some((video) => video.status === "draft") || !videos.length ? "draft" : "saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [list, setList] = useState(videos);
  const counts = useMemo(() => ({ draft: list.filter((v) => v.status === "draft").length, saved: list.filter((v) => v.status === "saved").length, published: list.filter((v) => v.status === "published").length }), [list]);
  const shown = list.filter((video) => video.status === tab);
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-NG" : undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  async function start(purpose: VideoPurpose) {
    setBusy(purpose);
    router.push(`/home/video/studio?purpose=${purpose}`);
  }

  async function remove(video: HubVideo) {
    if (!(await confirmDialog(t("hub.confirmDelete", { title: video.title })))) return;
    setBusy(video.id);
    try {
      const response = await fetch(`/api/app/videos/${video.id}`, { method: "DELETE" });
      if (response.ok) setList((current) => current.filter((item) => item.id !== video.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <section className={cx(card, "p-5")}>
        <h2 className="m-0 text-[18px] font-extrabold">{t("hub.create")}</h2>
        <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("hub.createHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(["ad", "product", "social"] as const).map((purpose) => (
            <button
              key={purpose}
              type="button"
              disabled={busy !== null}
              onClick={() => void start(purpose)}
              className="group flex flex-col items-start gap-2 rounded-[18px] border-2 border-app-line p-4 text-left transition hover:border-app-ink disabled:opacity-60"
            >
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-app-peach">{busy === purpose ? <Spinner className="h-5 w-5" /> : <Icon name={PURPOSE_ICON[purpose]} size={20} />}</span>
              <span className="text-[16px] font-extrabold">{t(`hub.purpose.${purpose}`)}</span>
              <span className="text-[13px] leading-[1.45] text-app-ink-soft">{t(`hub.purpose.${purpose}Hint`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={cx(card, "p-5")}>
        <div role="tablist" aria-label={t("hub.yourVideos")} className="flex flex-wrap gap-2">
          {(["draft", "saved", "published"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cx("inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 text-[14px] font-bold", tab === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}
            >
              {t(`hub.tab.${key}`)} <span className={cx("rounded-full px-1.5 text-[12px]", tab === key ? "bg-white/20" : "bg-app-canvas")}>{counts[key]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="m-0 mt-5 rounded-[16px] bg-app-canvas px-4 py-6 text-center text-[14px] text-app-ink-soft">{t(`hub.empty.${tab}`)}</p>
        ) : (
          <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((video) => (
              <li key={video.id} className="flex flex-col overflow-hidden rounded-[18px] border border-app-line">
                <Link href={`/home/video/studio?id=${video.id}`} className="relative block aspect-[9/16] bg-app-ink">
                  {video.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold">{t(`hub.purpose.${video.purpose}`)}</span>
                  {video.videoUrl ? <span className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"><Icon name="play" size={13} /></span> : null}
                  {video.seconds ? <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{Math.round(video.seconds)}s</span> : null}
                </Link>
                <div className="grid gap-1 p-2.5">
                  <p className="m-0 truncate text-[13.5px] font-extrabold">{video.title}</p>
                  <p className="m-0 text-[11.5px] text-app-ink-soft">{when(video.updatedAt)}{video.publishedTo.length ? ` · ${video.publishedTo.map((kind) => t(`hub.on.${kind}`)).join(", ")}` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Link href={`/home/video/studio?id=${video.id}`} className="rounded-full border border-app-line px-2.5 py-1 text-[12px] font-bold text-app-ink no-underline">{video.status === "draft" ? t("hub.continue") : t("hub.open")}</Link>
                    {video.videoUrl ? (
                      <Link href={`/home/ads/new?video=${video.id}`} className="rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white no-underline">{t("hub.useInAd")}</Link>
                    ) : null}
                    <button type="button" disabled={busy === video.id} onClick={() => void remove(video)} aria-label={t("hub.delete", { title: video.title })} className="ml-auto grid h-7 w-7 place-items-center rounded-full text-app-ink-soft hover:text-app-danger">
                      {busy === video.id ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="trash" size={13} />}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
