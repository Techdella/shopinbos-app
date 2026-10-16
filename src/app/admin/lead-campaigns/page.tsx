import Link from "next/link";
import { AppPage, Card, CardHead, EmptyState, Pill, PillLink, StatTile, type Tone } from "@/components/app-kit";
import { adminFrame, buttonClass } from "@/components/admin/AdminKit";
import { cancelLeadCampaign, deleteLeadCampaign, sendLeadCampaignNow, toggleLeadAutomation } from "@/app/actions/admin-lead-growth";
import { CAMPAIGN_STATUS_LABELS, CHANNEL_LABELS, percent, type CampaignStatus, type LeadChannel } from "@/lib/lead-growth/pure";
import { LeadGrowthNotReady, channelReadiness, listAutomations, listCampaigns } from "@/lib/lead-growth/service.server";
import { requireRole } from "@/lib/server-auth";
import { GrowthNotReady, lagosTime } from "./_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STATUS_TONE: Record<string, Tone> = { draft: "muted", scheduled: "info", sending: "accent", sent: "success", cancelled: "muted" };

// /admin/lead-campaigns: email, SMS and WhatsApp to website leads, as one-off campaigns or automations that walk each
// new lead through a few messages. Shows what each one sent and how many people signed up after it.
export default async function LeadCampaignsPage() {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const sub = "Turn website leads into Shopinbos accounts with email, SMS and WhatsApp.";

  let campaigns: Awaited<ReturnType<typeof listCampaigns>>;
  let automations: Awaited<ReturnType<typeof listAutomations>>;
  try {
    [campaigns, automations] = await Promise.all([listCampaigns(), listAutomations()]);
  } catch (error) {
    if (!(error instanceof LeadGrowthNotReady)) throw error;
    return (
      <AppPage frame={frame} title="Lead campaigns" sub={sub}>
        <GrowthNotReady />
      </AppPage>
    );
  }
  const ready = channelReadiness();
  const sent = campaigns.reduce((sum, c) => sum + c.sent, 0) + automations.reduce((sum, a) => sum + a.sent, 0);
  const converted = campaigns.reduce((sum, c) => sum + c.converted, 0) + automations.reduce((sum, a) => sum + a.converted, 0);

  return (
    <AppPage
      frame={frame}
      title="Lead campaigns"
      sub={sub}
      actions={
        <>
          <PillLink href="/admin/lead-campaigns/automations/new" icon="automation">New automation</PillLink>
          <PillLink href="/admin/lead-campaigns/new" tone="ink" icon="plus">New campaign</PillLink>
        </>
      }
    >
      <section aria-label="Overview" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile tone="card" label="Messages sent" value={sent} hint="Campaigns and automations" />
        <StatTile tone="card" label="Signed up after a message" value={converted} hint={percent(converted, sent) + " of messages"} />
        {(Object.keys(ready) as LeadChannel[]).map((channel) => (
          <StatTile key={channel} tone="card" label={CHANNEL_LABELS[channel]} value={ready[channel] ? "Ready" : "Not set up"} hint={ready[channel] ? "Platform account connected" : "Add the keys in Vercel"} />
        ))}
      </section>

      <Card className="mb-5 p-5">
        <CardHead title="Automations" sub="Each new lead that matches walks through the steps. They leave as soon as they sign up or opt out." />
        {automations.length === 0 ? (
          <EmptyState icon="automation" title="No automations yet" action={<PillLink href="/admin/lead-campaigns/automations/new" tone="ink" icon="plus">Set up a welcome series</PillLink>}>
            A welcome email straight away, a WhatsApp two days later and an SMS on day five converts far better than one message.
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
            {automations.map((automation) => (
              <li key={automation.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/lead-campaigns/automations/${automation.id}`} className="text-[15.5px] font-bold underline-offset-2 hover:underline">{automation.name}</Link>
                    <Pill tone={automation.active ? "success" : "muted"} dot>{automation.active ? "On" : "Off"}</Pill>
                  </div>
                  <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">
                    {automation.steps.map((step) => CHANNEL_LABELS[step.channel]).join(" → ")} · {automation.enrolled} entered · {automation.inProgress} in progress · {automation.sent} sent · <b className="text-app-ink">{automation.converted} signed up</b> ({percent(automation.converted, automation.enrolled)})
                  </p>
                </div>
                <form action={toggleLeadAutomation}>
                  <input type="hidden" name="id" value={automation.id} />
                  <input type="hidden" name="active" value={automation.active ? "0" : "1"} />
                  <button type="submit" className={buttonClass(automation.active ? "white" : "ink", "sm")}>{automation.active ? "Turn off" : "Turn on"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <CardHead title="Campaigns" sub="One-off sends. Conversions count people who signed up after the message reached them." />
        {campaigns.length === 0 ? (
          <EmptyState icon="megaphone" title="No campaigns yet" action={<PillLink href="/admin/lead-campaigns/new" tone="ink" icon="plus">New campaign</PillLink>}>
            Send an email, SMS or WhatsApp to everyone who signed up for the newsletter, downloaded a guide or joined the waitlist.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-app-line text-[12.5px] text-app-ink-soft">
                  <th className="py-2 pr-3 font-bold">Campaign</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 text-right font-bold">Sent</th>
                  <th className="py-2 pr-3 text-right font-bold">Failed</th>
                  <th className="py-2 pr-3 text-right font-bold">Signed up</th>
                  <th className="py-2 pr-3 font-bold">When</th>
                  <th className="py-2 font-bold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-app-line last:border-0">
                    <td className="py-3 pr-3">
                      <Link href={`/admin/lead-campaigns/${campaign.id}`} className="font-bold underline-offset-2 hover:underline">{campaign.name}</Link>
                      <div className="text-[12.5px] text-app-ink-soft">{CHANNEL_LABELS[campaign.channel as LeadChannel] ?? campaign.channel}{campaign.subject ? ` · ${campaign.subject}` : ""}</div>
                    </td>
                    <td className="py-3 pr-3"><Pill tone={STATUS_TONE[campaign.status] ?? "muted"} dot>{CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus] ?? campaign.status}</Pill></td>
                    <td className="py-3 pr-3 text-right font-mono">{campaign.sent}{campaign.total ? <span className="text-app-ink-soft">/{campaign.total}</span> : null}</td>
                    <td className="py-3 pr-3 text-right font-mono">{campaign.failed}</td>
                    <td className="py-3 pr-3 text-right font-mono"><b>{campaign.converted}</b> <span className="text-app-ink-soft">{percent(campaign.converted, campaign.sent)}</span></td>
                    <td className="py-3 pr-3 text-[13px] text-app-ink-soft">{campaign.status === "scheduled" ? `Sends ${lagosTime(campaign.scheduledAt)}` : campaign.startedAt ? lagosTime(campaign.startedAt) : `Made ${lagosTime(campaign.createdAt)}`}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        {campaign.status === "draft" && (
                          <form action={sendLeadCampaignNow}>
                            <input type="hidden" name="id" value={campaign.id} />
                            <button type="submit" className={buttonClass("ink", "sm")}>Send now</button>
                          </form>
                        )}
                        {(campaign.status === "scheduled" || campaign.status === "sending") && (
                          <form action={cancelLeadCampaign}>
                            <input type="hidden" name="id" value={campaign.id} />
                            <button type="submit" className={buttonClass("danger", "sm")}>{campaign.status === "sending" ? "Stop" : "Cancel"}</button>
                          </form>
                        )}
                        {(campaign.status === "draft" || campaign.status === "cancelled") && (
                          <form action={deleteLeadCampaign}>
                            <input type="hidden" name="id" value={campaign.id} />
                            <button type="submit" className={buttonClass("white", "sm")}>Delete</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppPage>
  );
}
