import { notFound } from "next/navigation";
import { AppPage, Card, CardHead, Pill, PillLink, StatTile } from "@/components/app-kit";
import { adminFrame, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { LeadCampaignEditor } from "@/components/admin/LeadCampaignEditor";
import { cancelLeadCampaign, scheduleLeadCampaign, sendLeadCampaignNow } from "@/app/actions/admin-lead-growth";
import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { CAMPAIGN_STATUS_LABELS, percent, readAudience, type CampaignStatus, type LeadChannel } from "@/lib/lead-growth/pure";
import { LeadGrowthNotReady, channelReadiness, getCampaign, listCampaigns } from "@/lib/lead-growth/service.server";
import { requireRole } from "@/lib/server-auth";
import { GrowthNotReady, LEAD_KIND_OPTIONS, lagosInputValue, lagosTime } from "../_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// /admin/lead-campaigns/[id]: edit a draft, then send now or schedule; once it goes out, its numbers.
export default async function LeadCampaignPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const { id } = await props.params;
  let campaign: Awaited<ReturnType<typeof getCampaign>>;
  let converted = 0;
  try {
    campaign = await getCampaign(id);
    if (campaign && campaign.status !== "draft") converted = (await listCampaigns()).find((c) => c.id === id)?.converted ?? 0;
  } catch (error) {
    if (!(error instanceof LeadGrowthNotReady)) throw error;
    return (
      <AppPage frame={frame} title="Lead campaign">
        <GrowthNotReady />
      </AppPage>
    );
  }
  if (!campaign) notFound();
  const ready = channelReadiness();
  const editable = campaign.status === "draft" || campaign.status === "scheduled";
  const channelReady = ready[campaign.channel as LeadChannel];

  return (
    <AppPage
      frame={frame}
      title={campaign.name}
      sub={<Pill tone={campaign.status === "sent" ? "success" : campaign.status === "sending" ? "accent" : "muted"} dot>{CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus] ?? campaign.status}{campaign.status === "scheduled" ? ` · ${lagosTime(campaign.scheduledAt)}` : ""}</Pill>}
      actions={<PillLink href="/admin/lead-campaigns" icon="arrowLeft">All campaigns</PillLink>}
    >
      {campaign.status !== "draft" && (
        <section aria-label="Results" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile tone="card" label="Reached" value={campaign.sent} hint={campaign.total ? `of ${campaign.total} at the start` : undefined} />
          <StatTile tone="card" label="Failed" value={campaign.failed} />
          <StatTile tone="card" label="Signed up since" value={converted} hint={percent(converted, campaign.sent)} />
          <StatTile tone="card" label={campaign.finishedAt ? "Finished" : "Started"} value={lagosTime(campaign.finishedAt ?? campaign.startedAt)} />
        </section>
      )}

      {editable && (
        <Card className="mb-5 p-5">
          <CardHead title="Send it" sub={channelReady ? "Sending runs in the background; this page shows progress when you refresh." : "This channel isn't set up yet, so nothing can go out. Add its keys in Vercel first."} />
          <div className="flex flex-wrap items-end gap-3">
            <form action={sendLeadCampaignNow}>
              <input type="hidden" name="id" value={campaign.id} />
              <button type="submit" className={buttonClass("ink")} disabled={!channelReady}>Send now</button>
            </form>
            <form action={scheduleLeadCampaign} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={campaign.id} />
              <label className="text-[13.5px] font-bold" htmlFor="at">
                Or schedule (Lagos time)
                <input id="at" name="at" type="datetime-local" required defaultValue={lagosInputValue(campaign.scheduledAt ?? new Date(Date.now() + 3_600_000))} className={`${fieldClass} mt-1.5 !w-auto`} />
              </label>
              <button type="submit" className={buttonClass("white")} disabled={!channelReady}>{campaign.status === "scheduled" ? "Change time" : "Schedule"}</button>
            </form>
            {campaign.status === "scheduled" && (
              <form action={cancelLeadCampaign}>
                <input type="hidden" name="id" value={campaign.id} />
                <button type="submit" className={buttonClass("danger")}>Cancel schedule</button>
              </form>
            )}
          </div>
        </Card>
      )}
      {campaign.status === "sending" && (
        <Card className="mb-5 p-5">
          <CardHead title="Going out now" sub="Refresh to see progress. Anything left when this run ends goes out on the next 10-minute run." />
          <form action={cancelLeadCampaign}>
            <input type="hidden" name="id" value={campaign.id} />
            <button type="submit" className={buttonClass("danger")}>Stop sending</button>
          </form>
        </Card>
      )}

      <LeadCampaignEditor
        initial={{ id: campaign.id, name: campaign.name, audience: readAudience(campaign.audience), channel: campaign.channel as LeadChannel, subject: campaign.subject, body: campaign.body, ctaLabel: campaign.ctaLabel, ctaUrl: campaign.ctaUrl, waTemplate: campaign.waTemplate, waLanguage: campaign.waLanguage, imageUrl: campaign.imageUrl }}
        readiness={ready}
        kinds={LEAD_KIND_OPTIONS}
        legal={platformLegal()}
        appUrl={appBase()}
        locked={!editable}
      />
    </AppPage>
  );
}
