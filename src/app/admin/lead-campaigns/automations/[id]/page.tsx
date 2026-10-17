import { notFound } from "next/navigation";
import { AppPage, Card, CardHead, Pill, PillLink } from "@/components/app-kit";
import { adminFrame, buttonClass } from "@/components/admin/AdminKit";
import { LeadAutomationEditor } from "@/components/admin/LeadAutomationEditor";
import { deleteLeadAutomation, toggleLeadAutomation } from "@/app/actions/admin-lead-growth";
import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { percent } from "@/lib/lead-growth/pure";
import { LeadGrowthNotReady, channelReadiness, listAutomations } from "@/lib/lead-growth/service.server";
import { requireRole } from "@/lib/server-auth";
import { GrowthNotReady, LEAD_KIND_OPTIONS, lagosTime } from "../../_shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function LeadAutomationPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const { id } = await props.params;
  let automation: Awaited<ReturnType<typeof listAutomations>>[number] | undefined;
  try {
    automation = (await listAutomations()).find((a) => a.id === id);
  } catch (error) {
    if (!(error instanceof LeadGrowthNotReady)) throw error;
    return (
      <AppPage frame={frame} title="Lead automation">
        <GrowthNotReady />
      </AppPage>
    );
  }
  if (!automation) notFound();

  return (
    <AppPage
      frame={frame}
      title={automation.name}
      sub={<Pill tone={automation.active ? "success" : "muted"} dot>{automation.active ? `On since ${lagosTime(automation.activatedAt)}` : "Off"}</Pill>}
      actions={<PillLink href="/admin/lead-campaigns" icon="arrowLeft">All campaigns</PillLink>}
    >
      <Card className="mb-5 p-5">
        <CardHead title={automation.active ? "Running" : "Switched off"} sub={`${automation.enrolled} leads entered · ${automation.inProgress} in progress · ${automation.sent} messages sent · ${automation.converted} signed up (${percent(automation.converted, automation.enrolled)})`} />
        <div className="flex flex-wrap gap-2">
          <form action={toggleLeadAutomation}>
            <input type="hidden" name="id" value={automation.id} />
            <input type="hidden" name="active" value={automation.active ? "0" : "1"} />
            <button type="submit" className={buttonClass(automation.active ? "white" : "ink")}>{automation.active ? "Turn off" : "Turn on"}</button>
          </form>
          {!automation.active && (
            <form action={deleteLeadAutomation}>
              <input type="hidden" name="id" value={automation.id} />
              <button type="submit" className={buttonClass("danger")}>Delete</button>
            </form>
          )}
        </div>
      </Card>
      <LeadAutomationEditor
        initial={{ id: automation.id, name: automation.name, audience: automation.audience, steps: automation.steps, includeExisting: automation.includeExisting, active: automation.active }}
        readiness={channelReadiness()}
        kinds={LEAD_KIND_OPTIONS}
        legal={platformLegal()}
        appUrl={appBase()}
      />
    </AppPage>
  );
}
