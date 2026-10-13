import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, Pill, PillLink, SplitLayout, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { formatDate } from "@/components/growth/kit";
import { channelStatus } from "@/lib/marketing/channels";
import { listAutomations } from "@/lib/marketing/automations";
import { FLOW_PRESETS, STEP_LABEL, TRIGGER_INFO, describeStep, type FlowStepType } from "@/lib/marketing/flows";
import { AddPresetButton, FlowToggle } from "./AutomationControls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automations" };

const LOG_TONE: Record<string, Tone> = { ok: "success", skipped: "muted", failed: "danger", exited: "warning" };
const LOG_LABEL: Record<string, string> = { ok: "Done", skipped: "Skipped", failed: "Failed", exited: "Stopped" };

export default async function AutomationsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [flows, logs, channels, enrolled30] = store
    ? await Promise.all([
        listAutomations(store.id, since),
        db.automationLog.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 25 }),
        channelStatus(store.id),
        db.automationEnrollment.count({ where: { storeId: store.id, createdAt: { gte: since } } }),
      ])
    : [[], [], null, 0];
  const names = new Map(flows.map((flow) => [flow.id, flow.name]));
  const usedPresets = new Set(flows.map((flow) => flow.preset).filter(Boolean));
  const sent30 = flows.reduce((sum, flow) => sum + flow.sent30d, 0);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Automations"
      sub="Messages that go out on their own when something happens: a sign-up, a left cart, a delivery, a birthday."
      actions={<PillLink href="/home/automations/new" tone="accent" icon="plus">New automation</PillLink>}
    >
      <div className="grid gap-5">
        {channels && !channels.email.ready ? <Notice tone="info">Automation emails can't go out yet. {channels.email.howTo}</Notice> : null}
        {channels && flows.some((f) => f.active && f.steps.some((step) => step.type === "send_whatsapp")) && !channels.whatsapp.templates ? (
          <Notice tone="info">
            WhatsApp steps in your automations are being skipped. {channels.whatsapp.howTo}{" "}
            {channels.whatsapp.connectHref ? <a href={channels.whatsapp.connectHref} className="font-bold underline">{channels.whatsapp.connectLabel}</a> : null}
          </Notice>
        ) : null}
        {channels && flows.some((f) => f.active && f.steps.some((step) => step.type === "send_sms")) && !channels.sms.ready ? (
          <Notice tone="info">
            SMS steps in your automations are being skipped. {channels.sms.howTo}{" "}
            {channels.sms.connectHref ? <a href={channels.sms.connectHref} className="font-bold underline">{channels.sms.connectLabel}</a> : null}
          </Notice>
        ) : null}
        <StatGrid>
          <StatTile tone="card" label="Automations on" value={flows.filter((f) => f.active).length} hint={`of ${flows.length}`} />
          <StatTile tone="card" label="People started a flow" value={enrolled30.toLocaleString("en-NG")} hint="last 30 days" />
          <StatTile tone="card" label="Messages sent" value={sent30.toLocaleString("en-NG")} hint="last 30 days" />
          <StatTile tone="card" label="In a flow now" value={flows.reduce((sum, f) => sum + f.inFlow, 0).toLocaleString("en-NG")} hint="waiting for their next step" />
        </StatGrid>

        <SplitLayout
          sideWidth="420px"
          main={
            <>
              <section className="grid gap-3">
                <h2 className="m-0 text-[17px] font-extrabold">Your automations</h2>
                {flows.length ? (
                  <div className="grid gap-3">
                    {flows.map((flow) => (
                      <Card key={flow.id} className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
                        <div className="min-w-0 flex-1 basis-[240px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={`/home/automations/${flow.id}`} className="truncate text-[16px] font-extrabold text-app-ink no-underline hover:underline">{flow.name}</a>
                            <Pill tone={flow.active ? "success" : "muted"} dot>{flow.active ? "On" : "Off"}</Pill>
                          </div>
                          <p className="mb-2 mt-1 text-[13.5px] text-app-ink-soft">When: {TRIGGER_INFO[flow.trigger]?.label ?? flow.trigger}{flow.trigger === "win_back" ? ` (${flow.settings.days ?? 90} days)` : ""}</p>
                          <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                            {flow.steps.slice(0, 6).map((step, index) => (
                              <li key={index} className="rounded-full bg-app-canvas px-2.5 py-1 text-[12px] font-semibold" title={describeStep(step)}>{STEP_LABEL[step.type as FlowStepType]}</li>
                            ))}
                            {flow.steps.length > 6 ? <li className="px-1 text-[12px] text-app-ink-soft">+{flow.steps.length - 6}</li> : null}
                          </ol>
                        </div>
                        <div className="text-[13px] text-app-ink-soft sm:w-[170px]">
                          <strong className="text-app-ink">{flow.sent30d}</strong> sent in 30 days
                          <div>{flow.inFlow} in the flow now</div>
                          <div>{flow.lastTriggeredAt ? `Last started ${formatDate(flow.lastTriggeredAt)}` : "Not started yet"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <FlowToggle id={flow.id} name={flow.name} active={flow.active} messages={flow.messages} />
                          <PillLink href={`/home/automations/${flow.id}`} size="sm">Edit</PillLink>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon="automation" title="No automations yet">Add a ready-made one on the right. Each starts switched off so you can read it first.</EmptyState>
                )}
              </section>

              <Card className="p-5">
                <CardHead title="Run log" sub="Every step every automation took, newest first" />
                {logs.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {logs.map((log) => (
                      <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
                        <span className="min-w-0 flex-1 basis-[220px]">
                          <span className="block truncate font-bold">{log.message}</span>
                          <span className="block truncate text-[12.5px] text-app-ink-soft">{names.get(log.automationId) ?? "Deleted automation"}{log.recipient ? ` · ${log.recipient}` : ""}</span>
                        </span>
                        <span className="text-[12.5px] text-app-ink-soft">{formatDate(log.createdAt, true)}</span>
                        <Pill tone={LOG_TONE[log.status] ?? "muted"}>{log.stepType === "enrolled" ? "Started" : LOG_LABEL[log.status] ?? log.status}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">Nothing has run yet. Once an automation is on, each message, skip and stop shows here.</p>
                )}
              </Card>
            </>
          }
          side={
            <Card className="p-5">
              <CardHead title="Ready-made automations" sub="Added switched off. Read them, then switch on." />
              <ul className="m-0 mt-3 grid list-none gap-3 p-0">
                {FLOW_PRESETS.map((preset) => (
                  <li key={preset.key} className="rounded-[16px] border border-app-line p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[15px]">{preset.name}</strong>
                      {usedPresets.has(preset.key) ? <Pill tone="success">Added</Pill> : null}
                    </div>
                    <p className="mb-2.5 mt-1 text-[13px] leading-[1.5] text-app-ink-soft">{preset.description}</p>
                    <AddPresetButton presetKey={preset.key} added={usedPresets.has(preset.key)} />
                  </li>
                ))}
              </ul>
            </Card>
          }
        />
        <AssistantNote>Order confirmation emails go out on their own at checkout. Automations here are for everything after: thank-yous, reviews, reminders and win-backs. Ask Peggy to set one up for you.</AssistantNote>
      </div>
    </SellerPage>
  );
}
