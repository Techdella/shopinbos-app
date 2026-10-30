"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";
import { fetchUnseenRexJobs, markRexJobsSeen } from "@/lib/ai/rex-jobs-client";
import { REX_JOB_KINDS, type RexJobKind, type RexJobView } from "@shared/rex-jobs";

// Top of Rex Studio: "Rex finished something for you" when a paid Rex job finished while the seller was away and
// they haven't seen it yet (shared/rex-jobs.ts). Each links to the screen that shows it (which marks it seen);
// "Hide" marks them all seen. Nothing shows when there's nothing new.

const SCREEN: Partial<Record<RexJobKind, string>> = {
  logo: "/studio/logo",
  image: "/studio/images",
  flyer: "/studio/images",
  packaging: "/home/labels/packaging",
  video_script: "/home/video",
  reel_shots: "/home/video",
  voiceover: "/home/video",
};

function thumbnail(job: RexJobView): string | null {
  const result = job.result ?? {};
  const logos = Array.isArray(result.logos) ? (result.logos as Array<{ url?: unknown }>) : [];
  const image = result.image && typeof result.image === "object" ? (result.image as { url?: unknown }).url : null;
  const candidates = [logos[0]?.url, image, result.url, result.imageUrl];
  const url = candidates.find((item): item is string => typeof item === "string" && /\.(png|jpe?g|webp)(\?|$)/i.test(item));
  return url ?? null;
}

export function RexFinishedStrip() {
  const t = useT("rexJobs");
  const [jobs, setJobs] = useState<RexJobView[]>([]);

  useEffect(() => {
    let live = true;
    void fetchUnseenRexJobs([...REX_JOB_KINDS]).then((rows) => {
      if (live) setJobs(rows.filter((job) => job.status === "done" && job.result).slice(0, 4));
    });
    return () => {
      live = false;
    };
  }, []);

  if (!jobs.length) return null;

  function hide() {
    void markRexJobsSeen(jobs.map((job) => job.id));
    setJobs([]);
  }

  return (
    <div role="status" className="shrink-0 border-b border-app-line bg-app-mint/60 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 text-[13.5px] font-extrabold text-app-forest">{t("strip.title")}</p>
        <ul className="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-1.5 p-0">
          {jobs.map((job) => {
            const href = SCREEN[job.kind];
            const thumb = thumbnail(job);
            const label = (
              <>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-6 w-6 rounded-[6px] object-cover" />
                ) : null}
                {t(`kind.${job.kind}`)}
              </>
            );
            return (
              <li key={job.id}>
                {href ? (
                  <Link href={href} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-bold text-app-ink hover:bg-app-canvas">
                    {label}
                    <span className="sr-only">{t("strip.open")}</span>
                  </Link>
                ) : (
                  <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-bold text-app-ink">{label}</span>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={hide} className="min-h-[32px] rounded-full px-3 text-[13px] font-bold text-app-forest hover:bg-white/60">
          {t("strip.hide")}
        </button>
      </div>
    </div>
  );
}
