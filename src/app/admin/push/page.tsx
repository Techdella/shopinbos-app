import type { Metadata } from "next";
import { AppPage } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { adminFrame } from "@/components/admin/AdminKit";
import { PushCenter, type CampaignView } from "@/components/admin/PushCenter";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { canSendUrgent, knownCities, listCampaigns, pushCenterReady, pushOverview } from "@/lib/push-campaigns/campaigns.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Push center" };

// Admin › Push center: how many phones and browsers can get a push and how recent deliveries went; write a push,
// pick who gets it, preview it, test it on your own phone, then send it now or schedule it (Lagos time); and see
// how each campaign did. Sending is src/lib/push-campaigns/campaigns.server.ts.

export default async function AdminPushPage() {
  const user = await requireAdminSection("content");
  const frame = adminFrame(user, "Search suppliers, products, partners");
  const sub = "Send a push to the phone app and web browsers. It also lands under the bell, and people who switched off Shopinbos news only get the bell.";
  if (!(await pushCenterReady())) {
    return (
      <AppPage frame={frame} title="Push center" sub={sub}>
        <Notice tone="info">The Push center needs a database update first. Run docs/migrations/2026-11-30-push-center.sql, then reload this page.</Notice>
      </AppPage>
    );
  }
  const [overview, campaigns, cities] = await Promise.all([pushOverview(), listCampaigns(30), knownCities()]);
  const rows: CampaignView[] = campaigns.map(toView);

  return (
    <AppPage frame={frame} title="Push center" sub={sub}>
      <PushCenter
        initial={rows}
        overview={JSON.parse(JSON.stringify(overview))}
        cities={cities}
        canUrgent={canSendUrgent(user.adminRole)}
        admin={{ name: user.name, email: user.email }}
      />
    </AppPage>
  );
}

function toView(row: Awaited<ReturnType<typeof listCampaigns>>[number]): CampaignView {
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  return {
    ...row,
    audience: row.audience as CampaignView["audience"],
    scheduledAt: iso(row.scheduledAt),
    startedAt: iso(row.startedAt),
    sentAt: iso(row.sentAt),
    cancelledAt: iso(row.cancelledAt),
    testedAt: iso(row.testedAt),
    resentAt: iso(row.resentAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
