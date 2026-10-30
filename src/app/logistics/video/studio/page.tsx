import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { VideoStudio } from "@/app/home/video/VideoStudio";
import { isVideoPurpose, readVideoConfig } from "@shared/video-projects";
import { videoOwnerId } from "@shared/video-owner";
import { getT } from "@/lib/i18n/server";
import { elevenLabsReady } from "@/lib/ai/elevenlabs.server";
import { reelBrand } from "@shared/video-style";
import { liveCreditPrices } from "@/lib/ai/credits.server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("video");
  return { title: t("title") };
}

// The video studio for delivery partners (the phone's "Finish on the web" opens a partner's draft here; the reel is
// drawn in the browser). Same studio as /home/video/studio, with the partner's brand (LogisticsPartner display name
// and logo; partners have no theme colours) and no product or ad. The project's storeId is the partner's
// LogisticsPartner.id (shared/video-owner.ts; no migration). No products: "product" videos are shop-only.
export default async function LogisticsVideoStudioPage({ searchParams }: { searchParams: Promise<{ id?: string; purpose?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const { id, purpose } = await searchParams;
  const [t, partner, { costs }] = await Promise.all([getT("video"), getLogisticsPartnerForUser(user), liveCreditPrices()]);
  const ownerId = videoOwnerId(user.role, { partnerId: partner.id });
  const project = id && ownerId ? await db.videoProject.findFirst({ where: { id, storeId: ownerId } }).catch(() => null) : null;
  if (id && !project) redirect("/logistics/video");
  const name = partner.displayName || partner.companyName;
  const start = isVideoPurpose(purpose) && purpose !== "product" ? purpose : "social";
  const saved = project && isVideoPurpose(project.purpose) && project.purpose !== "product" ? project.purpose : "social";

  return (
    <PartnerPage frame={{ user, partner }} title={t("title")} sub={t("partner.hubSub")}>
      <VideoStudio
        partner
        storeName={name}
        storeHost={partner.whatsappNumber ?? partner.contactPhone ?? ""}
        initialProductId={null}
        project={project ? { id: project.id, title: project.title, purpose: saved, status: project.status, videoUrl: project.videoUrl, config: readVideoConfig(project.config) } : null}
        purpose={start}
        brand={reelBrand(null, partner.logoUrl ?? null)}
        elevenLabs={elevenLabsReady()}
        costs={{ image: costs.photo ?? costs.image, video: costs.video }}
        products={[]}
      />
    </PartnerPage>
  );
}
