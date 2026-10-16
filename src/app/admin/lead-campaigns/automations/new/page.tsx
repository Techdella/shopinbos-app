import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { LeadAutomationEditor } from "@/components/admin/LeadAutomationEditor";
import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { channelReadiness } from "@/lib/lead-growth/service.server";
import { requireRole } from "@/lib/server-auth";
import { LEAD_KIND_OPTIONS } from "../../_shared";

export const dynamic = "force-dynamic";

export default async function NewLeadAutomationPage() {
  const user = await requireRole(["admin"], "/admin/login");
  return (
    <AppPage frame={adminFrame(user, "Search leads")} title="New lead automation" sub="A few messages each new lead gets over their first days. Save it, then switch it on." actions={<PillLink href="/admin/lead-campaigns" icon="arrowLeft">All campaigns</PillLink>}>
      <LeadAutomationEditor initial={null} readiness={channelReadiness()} kinds={LEAD_KIND_OPTIONS} legal={platformLegal()} appUrl={appBase()} />
    </AppPage>
  );
}
