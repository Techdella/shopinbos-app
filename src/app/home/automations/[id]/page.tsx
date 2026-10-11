import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, Pill, PillLink, type Tone } from "@/components/app-kit";
import { formatDate } from "@/components/growth/kit";
import { parseFlowConfig, type FlowTrigger } from "@/lib/marketing/flows";
import { listSegments } from "@/lib/marketing/segments";
import { listTemplates } from "@/lib/marketing/templates";
import { FlowEditor } from "./FlowEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automation" };

const LOG_TONE: Record<string, Tone> = { ok: "success", skipped: "muted", failed: "danger", exited: "warning" };

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/onboarding");
  const rule = id === "new" ? null : await db.automationRule.findFirst({ where: { id, storeId: store.id } });
  if (id !== "new" && !rule) notFound();
  const flow = rule ? parseFlowConfig(rule.actionConfig, rule) : { steps: [], settings: {} };
  const [segments, templates, logs, enrollments] = await Promise.all([
    listSegments(store.id),
    listTemplates(store.id),
    rule ? db.automationLog.findMany({ where: { automationId: rule.id }, orderBy: { createdAt: "desc" }, take: 50 }) : [],
    rule ? db.automationEnrollment.groupBy({ by: ["status"], where: { automationId: rule.id }, _count: true }) : [],
  ]);
  const count = (status: string) => enrollments.find((row) => row.status === status)?._count ?? 0;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={rule ? rule.name : "New automation"}
      sub={rule ? `${count("active")} in the flow now · ${count("completed")} finished · ${count("exited")} stopped early` : "Pick what starts it, then add waits, checks and messages."}
      actions={<PillLink href="/home/automations" icon="arrowLeft">All automations</PillLink>}
    >
      <div className="grid gap-5">
        <FlowEditor
          initial={{
            id: rule?.id ?? null,
            name: rule?.name ?? "",
            description: rule?.description ?? "",
            trigger: (rule?.trigger as FlowTrigger) ?? "welcome_email",
            active: rule?.active ?? false,
            steps: flow.steps,
            days: flow.settings.days ?? 90,
          }}
          segments={segments.map((s) => ({ id: s.id, name: s.name }))}
          templates={templates.saved.map((t) => ({ id: t.id, name: t.name }))}
        />
        {rule ? (
          <Card className="p-5">
            <CardHead title="Run log" sub="What this automation did, newest first" />
            {logs.length ? (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {logs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1 basis-[220px]">
                      <span className="block truncate font-bold">{log.stepType === "enrolled" ? "Started" : `Step ${log.stepIndex + 1}`}: {log.message}</span>
                      {log.recipient ? <span className="block truncate text-[12.5px] text-app-ink-soft">{log.recipient}</span> : null}
                    </span>
                    <span className="text-[12.5px] text-app-ink-soft">{formatDate(log.createdAt, true)}</span>
                    <Pill tone={LOG_TONE[log.status] ?? "muted"}>{log.status === "ok" ? "Done" : log.status === "exited" ? "Stopped" : log.status === "failed" ? "Failed" : "Skipped"}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">Nothing yet.{rule.active ? " It runs the next time someone matches." : " Switch it on to start."}</p>
            )}
          </Card>
        ) : null}
      </div>
    </SellerPage>
  );
}
