import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { HelpVideosManager, type HelpVideoAdminRow } from "@/components/admin/HelpVideosManager";
import { db } from "@/lib/db/client";
import { HELP_VIDEO_SELECT, storageBase } from "@/lib/help-videos.server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// /admin/help-videos: the one-minute videos Help offers on each screen ("Watch a 1-minute video").
export default async function AdminHelpVideosPage() {
  const user = await requireRole(["admin"], "/admin/login");
  let rows: HelpVideoAdminRow[] = [];
  let migrationNeeded = false;
  try {
    const found = await db.helpVideo.findMany({ orderBy: [{ topic: "asc" }, { language: "asc" }], select: HELP_VIDEO_SELECT });
    rows = found.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    migrationNeeded = true;
  }

  return (
    <AppPage
      frame={adminFrame(user, "Search suppliers, products, partners")}
      title="Help videos"
      sub="One-minute videos people can watch from Help on the screen they're stuck on. Upload a file or paste a YouTube or Vimeo link, then publish."
    >
      <HelpVideosManager initial={rows} storageBase={storageBase()} migrationNeeded={migrationNeeded} />
    </AppPage>
  );
}
