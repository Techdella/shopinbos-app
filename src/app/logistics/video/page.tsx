import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { isVideoPurpose, readPublished, readVideoConfig, type VideoStatus } from "@shared/video-projects";
import { videoOwnerId } from "@shared/video-owner";
import { pageWindow } from "@/lib/pagination";
import { VideoHub } from "@/app/home/video/VideoHub";

const PAGE_SIZE = 24;

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("video");
  return { title: t("title") };
}

// A delivery partner's videos with Rex (the seller's /home/video, for role logistics_partner). Their projects are
// the VideoProject rows whose storeId is their LogisticsPartner.id (shared/video-owner.ts; no migration).
export default async function LogisticsVideoPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const { tab: rawTab, page } = await searchParams;
  const [t, partner] = await Promise.all([getT("video"), getLogisticsPartnerForUser(user)]);
  const ownerId = videoOwnerId(user.role, { partnerId: partner.id }) ?? "__none__";
  const groups = await db.videoProject.groupBy({ by: ["status"], where: { storeId: ownerId }, _count: { _all: true } }).catch(() => []);
  const counts = { draft: 0, saved: 0, published: 0 };
  for (const row of groups) counts[row.status === "saved" || row.status === "published" ? row.status : "draft"] += row._count._all;
  const tab: VideoStatus = rawTab === "draft" || rawTab === "saved" || rawTab === "published" ? rawTab : counts.draft || !(counts.saved + counts.published) ? "draft" : "saved";
  const paging = pageWindow(page, counts[tab], PAGE_SIZE);
  const where = { storeId: ownerId, ...(tab === "draft" ? { status: { notIn: ["saved", "published"] } } : { status: tab }) };
  const projects = paging.total
    ? await db.videoProject.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take }).catch(() => [])
    : [];

  return (
    <PartnerPage frame={{ user, partner }} title={t("title")} sub={t("partner.hubSub")}>
      <VideoHub
        partner
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
    </PartnerPage>
  );
}
