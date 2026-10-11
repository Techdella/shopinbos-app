import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { parseRecipientFilter } from "@/lib/campaigns/send";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, Pill, PillLink, SplitLayout, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { ConfirmSubmit } from "@/components/growth/ConfirmSubmit";
import { DetailList, Field, buttonClass, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import {
  saveBroadcastCampaign,
  sendBroadcastCampaign,
  deleteBroadcastCampaign,
  testSendCampaign,
} from "@/app/actions/marketing";

export const dynamic = "force-dynamic";
// Sending runs inside the server action; give large audiences time to go out in batches.
export const maxDuration = 300;

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "Not set";
  // toLocaleDateString rejects timeStyle, so use toLocaleString; campaign times are shown in Lagos time.
  return new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; sent?: string; failed?: string; tested?: string; error?: string }>;
};

function campaignPath(id: string, query: Record<string, string | number>) {
  return `/home/marketing/campaigns/${id}?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`;
}

async function saveBroadcastCampaignForm(formData: FormData) {
  "use server";
  const result = await saveBroadcastCampaign(formData);
  const id = result.id ?? ((formData.get("id") as string) || "new");
  redirect(campaignPath(id, result.error ? { error: result.error } : { saved: 1 }));
}

async function sendBroadcastCampaignForm(formData: FormData) {
  "use server";
  // Save the editor's current content first, so "Send now" sends what the seller sees.
  const saved = formData.get("name") ? await saveBroadcastCampaign(formData) : { id: formData.get("id") as string };
  if ("error" in saved && saved.error) redirect(campaignPath((formData.get("id") as string) || "new", { error: saved.error }));
  const id = saved.id!;
  const sendData = new FormData();
  sendData.set("id", id);
  const result = await sendBroadcastCampaign(sendData);
  redirect(campaignPath(id, result.error ? { error: result.error } : { sent: result.sent ?? 0, failed: result.failed ?? 0 }));
}

async function deleteBroadcastCampaignForm(formData: FormData) {
  "use server";
  await deleteBroadcastCampaign(formData);
  redirect("/home/marketing?tab=Campaigns");
}

async function testSendCampaignForm(formData: FormData) {
  "use server";
  const result = await testSendCampaign(formData);
  const id = (formData.get("id") as string) || "new";
  redirect(campaignPath(id, "error" in result && result.error ? { error: result.error } : { tested: 1 }));
}

/** datetime-local value in Lagos time (WAT, UTC+1). */
function toLagosInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0%";
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: "muted", label: "Draft" },
  scheduled: { tone: "info", label: "Scheduled" },
  sending: { tone: "info", label: "Sending" },
  sent: { tone: "success", label: "Sent" },
  cancelled: { tone: "warning", label: "Cancelled" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <legend className="mb-3 p-0 text-[17px] font-extrabold">{title}</legend>
      {children}
    </fieldset>
  );
}

export default async function CampaignEditorPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const notice = await searchParams;
  const isNew = id === "new";
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true, logoUrl: true },
  });
  if (!store) redirect("/login");

  const campaign = isNew
    ? null
    : await db.broadcastCampaign.findFirst({
        where: { id, storeId: store.id },
        select: {
          id: true, name: true, subject: true, bodyHtml: true, templateId: true, status: true, recipientFilter: true,
          sentCount: true, openCount: true, clickCount: true, conversionCount: true, revenueGenerated: true,
          unsubscribeCount: true, scheduledAt: true, sentAt: true, createdAt: true,
        },
      });
  if (!isNew && !campaign) notFound();
  const editable = isNew || (campaign!.status !== "sent" && campaign!.status !== "sending");
  const activeSubscribers = await db.subscriber.count({ where: { storeId: store.id, status: "active" } });

  const emailTemplates = await db.$queryRawUnsafe<Array<{ id: string; name: string; subject: string }>>(
    `SELECT id, name, subject FROM "EmailTemplate" WHERE "storeId" = $1 ORDER BY name`, store.id,
  );

  const buyerStats = await db.$queryRawUnsafe<Array<{ total: bigint; unique: bigint; spend: number }>>(
    `SELECT COUNT(*)::bigint AS total, COUNT(DISTINCT "buyerEmail")::bigint AS unique, COALESCE(SUM(total), 0) AS spend FROM "RetailOrder" WHERE "storeId" = $1 AND "buyerEmail" IS NOT NULL`,
    store.id,
  );

  const stats = buyerStats[0] || { total: BigInt(0), unique: BigInt(0), spend: 0 };

  const cfg = parseRecipientFilter(campaign?.recipientFilter ?? { mode: "all" });
  const status = campaign ? STATUS[campaign.status] ?? { tone: "muted" as Tone, label: campaign.status } : null;
  const radioRow = "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[14px] border border-app-line px-3.5 py-2 text-[14px] has-[:checked]:border-app-ink";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={isNew ? "New campaign" : campaign!.name}
      sub={isNew ? "Write a broadcast email to your buyers and subscribers." : `${campaign!.subject} · made ${fmtDate(campaign!.createdAt)}`}
      actions={<PillLink href="/home/marketing?tab=Campaigns" icon="arrowLeft">All campaigns</PillLink>}
    >
      <div className="grid gap-5">
        {notice.error ? (
          <Notice>{notice.error}</Notice>
        ) : notice.sent ? (
          <Notice tone="success">
            Sent to {notice.sent} recipient{notice.sent === "1" ? "" : "s"}.{Number(notice.failed) > 0 ? ` ${notice.failed} couldn't be sent. Press Send again to retry them.` : ""}
          </Notice>
        ) : notice.tested ? (
          <Notice tone="success">Test email sent to {user.email}.</Notice>
        ) : notice.saved ? (
          <Notice tone="success">
            {campaign?.status === "scheduled" ? `Saved. Scheduled for ${fmtDate(campaign.scheduledAt)} (Lagos time).` : "Campaign saved."}
          </Notice>
        ) : null}

        <SplitLayout
          sideWidth="380px"
          main={
            <Card className="p-5 sm:p-6">
              <form action={saveBroadcastCampaignForm} className="grid gap-7">
                {!isNew && campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}

                <Section title="Campaign details">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Campaign name" htmlFor="c-name">
                      <input id="c-name" name="name" className={inputClass} defaultValue={campaign?.name ?? ""} required placeholder="e.g. Friday sale announcement" />
                    </Field>
                    <Field label="Email subject" htmlFor="c-subject">
                      <input id="c-subject" name="subject" className={inputClass} defaultValue={campaign?.subject ?? ""} required placeholder="e.g. 30% off everything, this week only" />
                    </Field>
                  </div>
                </Section>

                <Section title="Email content">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Use a template (optional)" htmlFor="c-template">
                      <select id="c-template" name="templateId" className={selectClass} defaultValue={campaign?.templateId ?? ""}>
                        <option value="">None, write my own</option>
                        {emailTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}: {t.subject}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Send later (optional, Lagos time)" htmlFor="c-schedule">
                      <input id="c-schedule" name="scheduledAt" type="datetime-local" className={inputClass} defaultValue={toLagosInputValue(campaign?.scheduledAt ?? null)} />
                    </Field>
                  </div>
                  <Field
                    label="Email body (HTML)"
                    htmlFor="c-body"
                    hint={<>Use <code>{`{{name}}`}</code> for the buyer&apos;s name and <code>{`{{store}}`}</code> for your shop name.</>}
                  >
                    <textarea
                      id="c-body"
                      name="bodyHtml"
                      className={`${textareaClass} font-mono text-[13px] leading-[1.6]`}
                      rows={14}
                      defaultValue={campaign?.bodyHtml ?? ""}
                      placeholder={`<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">\n  <h1>Hi {{name}},</h1>\n  <p>Great news from {{store}}!</p>\n</div>`}
                    />
                  </Field>
                </Section>

                <Section title="Who gets it">
                  <p className="m-0 text-[13.5px] text-app-ink-soft">
                    {Number(stats.unique)} buyers with an email · {Number(stats.total)} orders · {store.currency} {Number(stats.spend).toLocaleString()} spent
                  </p>
                  <div className="grid gap-2">
                    <label className={radioRow}>
                      <input type="radio" name="filterMode" value="all" defaultChecked={!cfg.mode || cfg.mode === "all"} className={checkClass} />
                      Everyone: buyers and newsletter subscribers
                    </label>
                    <label className={radioRow}>
                      <input type="radio" name="filterMode" value="subscribers" defaultChecked={cfg.mode === "subscribers"} className={checkClass} />
                      Newsletter subscribers only ({activeSubscribers})
                    </label>
                    <div className={`${radioRow} flex-wrap`}>
                      <input id="mode-orders" type="radio" name="filterMode" value="min_orders" defaultChecked={cfg.mode === "min_orders"} className={checkClass} />
                      <label htmlFor="mode-orders" className="cursor-pointer">Buyers with at least</label>
                      <input name="minOrders" type="number" aria-label="Minimum orders" min="1" defaultValue={cfg.mode === "min_orders" ? cfg.value : 2} className={`${inputClass} h-[40px] w-[84px]`} />
                      <span>orders</span>
                    </div>
                    <div className={`${radioRow} flex-wrap`}>
                      <input id="mode-spend" type="radio" name="filterMode" value="min_spend" defaultChecked={cfg.mode === "min_spend"} className={checkClass} />
                      <label htmlFor="mode-spend" className="cursor-pointer">Buyers who spent at least {store.currency}</label>
                      <input name="minSpend" type="number" aria-label="Minimum spend" min="0" step="100" defaultValue={cfg.mode === "min_spend" ? cfg.value : 10000} className={`${inputClass} h-[40px] w-[120px]`} />
                    </div>
                    <div className={`${radioRow} flex-col items-stretch`}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input type="radio" name="filterMode" value="specific" defaultChecked={cfg.mode === "specific"} className={checkClass} />
                        Only these emails (one per line)
                      </label>
                      <textarea
                        name="filterEmails"
                        aria-label="Emails to send to"
                        className={`${textareaClass} font-mono text-[13px]`}
                        rows={3}
                        defaultValue={cfg.mode === "specific" ? cfg.emails.join("\n") : ""}
                        placeholder={"buyer@example.com\nanother@example.com"}
                      />
                    </div>
                  </div>
                </Section>

                <div className="flex flex-wrap items-center gap-2 border-t border-app-line pt-5">
                  {editable ? <button type="submit" className={buttonClass("ink")}>Save campaign</button> : null}
                  {editable ? (
                    <ConfirmSubmit formAction={sendBroadcastCampaignForm} message="Send this campaign now?" className={buttonClass("accent")}>Send now</ConfirmSubmit>
                  ) : null}
                  {!isNew && campaign ? (
                    <ConfirmSubmit formAction={deleteBroadcastCampaignForm} message="Delete this campaign?" className={buttonClass("danger")}>Delete</ConfirmSubmit>
                  ) : null}
                  <a href="/home/marketing?tab=Campaigns" className={buttonClass("ghost", "md", "sm:ml-auto")}>Cancel</a>
                </div>
              </form>
            </Card>
          }
          side={
            <>
              <Card className="p-5">
                <CardHead title="Status" action={status ? <Pill tone={status.tone}>{status.label}</Pill> : undefined} />
                {!isNew && campaign ? (
                  <DetailList
                    className="mt-2"
                    rows={[
                      ["Sent", campaign.sentCount.toLocaleString("en-NG")],
                      ["Opens", `${campaign.openCount} · ${pct(campaign.openCount, campaign.sentCount)}`],
                      ["Clicks", `${campaign.clickCount} · ${pct(campaign.clickCount, campaign.sentCount)}`],
                      ["Orders", String(campaign.conversionCount)],
                      ["Sales", `${store.currency} ${campaign.revenueGenerated.toLocaleString()}`],
                      ["Unsubscribes", String(campaign.unsubscribeCount)],
                      ...(campaign.scheduledAt ? [["Scheduled", fmtDate(campaign.scheduledAt)] as [string, string]] : []),
                      ...(campaign.sentAt ? [["Sent at", fmtDate(campaign.sentAt)] as [string, string]] : []),
                      ["Made", fmtDate(campaign.createdAt)],
                    ]}
                  />
                ) : (
                  <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Save the campaign to see how it&apos;s doing.</p>
                )}
              </Card>

              <Card className="p-5">
                <CardHead title="Recipients" />
                <DetailList
                  className="mt-2"
                  rows={[
                    ["Buyers", Number(stats.unique)],
                    ["Newsletter subscribers", activeSubscribers],
                    ...(cfg.mode && cfg.mode !== "all"
                      ? [[
                          "Only sending to",
                          cfg.mode === "min_orders"
                            ? `${cfg.value}+ paid orders`
                            : cfg.mode === "min_spend"
                              ? `${store.currency} ${cfg.value.toLocaleString()}+ spent`
                              : cfg.mode === "subscribers"
                                ? "Subscribers only"
                                : `${cfg.emails.length} emails`,
                        ] as [string, string]]
                      : []),
                  ]}
                />
                <p className="mb-0 mt-3 text-[13px] leading-[1.5] text-app-ink-soft">People who unsubscribed are always skipped. Every email has an unsubscribe link.</p>
              </Card>

              <Card className="p-5">
                <CardHead title="Send a test" />
                <form action={testSendCampaignForm} className="mt-2 grid gap-3">
                  {!isNew && campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
                  <input type="hidden" name="subject" value={campaign?.subject ?? ""} />
                  <input type="hidden" name="bodyHtml" value={campaign?.bodyHtml ?? ""} />
                  <p className="m-0 text-[13.5px] text-app-ink-soft">
                    Sends the saved version to <strong className="break-all text-app-ink">{user.email}</strong>.
                  </p>
                  <button type="submit" className={buttonClass("white", "md", "w-full")}>Send test email</button>
                </form>
              </Card>

              {!isNew && campaign && campaign.status !== "sent" && (
                <Card className="p-5">
                  <CardHead title="Quick actions" />
                  <div className="mt-3 grid gap-2">
                    {editable && (
                      <form action={sendBroadcastCampaignForm}>
                        <input type="hidden" name="id" value={campaign.id} />
                        <ConfirmSubmit message="Send the saved campaign now?" className={buttonClass("accent", "md", "w-full")}>Send campaign now</ConfirmSubmit>
                      </form>
                    )}
                    <form action={deleteBroadcastCampaignForm}>
                      <input type="hidden" name="id" value={campaign.id} />
                      <ConfirmSubmit message="Delete this campaign?" className={buttonClass("danger", "md", "w-full")}>Delete campaign</ConfirmSubmit>
                    </form>
                  </div>
                </Card>
              )}
            </>
          }
        />
      </div>
    </SellerPage>
  );
}
