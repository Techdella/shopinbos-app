import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getT } from "@/lib/i18n/server";
import { isVideoPurpose, readPublished, readVideoConfig } from "@shared/video-projects";
import { VideoHub } from "./VideoHub";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("video");
  return { title: t("title") };
}

// Video studio home: start a video for an ad, a product or social media, and pick up drafts, saved and published
// videos (VideoProject). Links from Rex and products (?product=) go straight into the studio.
export default async function VideoHomePage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  if (product) redirect(`/home/video/studio?purpose=product&product=${encodeURIComponent(product)}`);
  const user = await requireRole(["seller"], "/login");
  const t = await getT("video");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  const projects = store
    ? await db.videoProject
        .findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" }, take: 90 })
        .catch(() => [])
    : [];

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("hub.sub")}>
      <VideoHub
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
