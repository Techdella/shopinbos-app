import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { LeadCampaignEditor } from "@/components/admin/LeadCampaignEditor";
import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { channelReadiness } from "@/lib/lead-growth/service.server";
import { requireRole } from "@/lib/server-auth";
import { LEAD_KIND_OPTIONS } from "../_shared";

export const dynamic = "force-dynamic";

export default async function NewLeadCampaignPage(props: { searchParams?: Promise<{ channel?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const requested = (await props.searchParams)?.channel;
  const channel = requested === "whatsapp" || requested === "sms" ? requested : "email";
  return (
    <AppPage frame={adminFrame(user, "Search leads")} title="New lead campaign" sub="Pick who gets it, write the message, send yourself a test, then save. You can send or schedule it next." actions={<PillLink href="/admin/lead-campaigns" icon="arrowLeft">All campaigns</PillLink>}>
      <LeadCampaignEditor initial={null} defaultChannel={channel} readiness={channelReadiness()} kinds={LEAD_KIND_OPTIONS} legal={platformLegal()} appUrl={appBase()} locked={false} />
    </AppPage>
  );
}
