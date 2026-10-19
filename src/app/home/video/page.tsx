import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getT } from "@/lib/i18n/server";
import { isVideoPurpose, readPublished, readVideoConfig, type VideoStatus } from "@shared/video-projects";
import { pageWindow } from "@/lib/pagination";

const PAGE_SIZE = 24;
import { VideoHub } from "./VideoHub";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("video");
  return { title: t("title") };
}

// Video studio home: start a video for an ad, a product or social media, and pick up drafts, saved and published
// videos (VideoProject). Links from Rex and products (?product=) go straight into the studio.
export default async function VideoHomePage({ searchParams }: { searchParams: Promise<{ product?: string; tab?: string; page?: string }> }) {
  const { product, tab: rawTab, page } = await searchParams;
  if (product) redirect(`/home/video/studio?purpose=product&product=${encodeURIComponent(product)}`);
  const user = await requireRole(["seller"], "/login");
  const t = await getT("video");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  // Each tab is its own query, a page at a time, so older videos are never cut off.
  const groups = store ? await db.videoProject.groupBy({ by: ["status"], where: { storeId: store.id }, _count: { _all: true } }).catch(() => []) : [];
  const counts = { draft: 0, saved: 0, published: 0 };
  for (const row of groups) counts[row.status === "saved" || row.status === "published" ? row.status : "draft"] += row._count._all;
  const tab: VideoStatus = rawTab === "draft" || rawTab === "saved" || rawTab === "published" ? rawTab : counts.draft || !(counts.saved + counts.published) ? "draft" : "saved";
  const paging = pageWindow(page, counts[tab], PAGE_SIZE);
  const where = { storeId: store?.id ?? "__none__", ...(tab === "draft" ? { status: { notIn: ["saved", "published"] } } : { status: tab }) };
  const projects = store && paging.total
    ? await db.videoProject
        .findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take })
        .catch(() => [])
    : [];

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("hub.sub")}>
      <VideoHub
        tab={tab}
        counts={counts}
        paging={paging}
        videos={projects.map((project) => {
          const config = readVideoConfig(project.config);
          return {
            id: project.id,
            title: project.title,
            purpose: isVideoPurpose(project.purpose) ? project.purpose : "social",
            status: project.status === "saved" || project.status === "published" ? project.status : "draft",
            videoUrl: project.videoUrl,
            cover: project.posterUrl ?? config.photos?.[0] ?? null,
            seconds: project.seconds,
            updatedAt: project.updatedAt.toISOString(),
            publishedTo: readPublished(project.publishedTo).map((entry) => entry.kind),
          };
        })}
      />
    </SellerPage>
  );
}
