import type { Metadata } from "next";
import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { UpdatesManager, type UpdateAdminRow } from "@/components/admin/UpdatesManager";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { storageBase } from "@/lib/help-videos.server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { adminUpdateRows } from "@/lib/weekly-updates.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly updates" };

// /admin/updates: the weekly updates (selling tips, news) sellers, suppliers and delivery partners tap through from
// the ring in the top bar. Text, motion, image and video cards, each for chosen roles between a start and end date.
export default async function AdminUpdatesPage() {
  const user = await requireAdminSection("content");
  let rows: UpdateAdminRow[] = [];
  let migrationNeeded = false;
  try {
    rows = await adminUpdateRows();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    migrationNeeded = true;
  }

  return (
    <AppPage
      frame={adminFrame(user, "Search suppliers, products, partners")}
      title="Weekly updates"
      sub="Post a selling tip or some news for sellers, suppliers and delivery partners. They see it as an update from the ring at the top of the app, like a WhatsApp Status."
    >
      <UpdatesManager initial={rows} storageBase={storageBase()} migrationNeeded={migrationNeeded} />
    </AppPage>
  );
}
