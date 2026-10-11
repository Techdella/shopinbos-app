import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { TopBar } from "@/components/shell/TopBar";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { parseRecipientFilter } from "@/lib/campaigns/send";
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
  if (!d) return "—";
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
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

export default async function CampaignEditorPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const notice = await searchParams;
  const isNew = id === "new";
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true },
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

  return (
    <AppFrame
      role="seller"
      chipMode="rail"
      chipRole="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <TopBar
        eyebrow="CAMPAIGN"
        title={isNew ? "New campaign" : campaign!.name}
        subtitle={isNew ? "Create a broadcast email campaign" : `${campaign!.subject} · ${fmtDate(campaign!.createdAt)}`}
        actions={
          <Link href="/home/marketing?tab=Campaigns" className="no-underline">
            <Btn variant="ghost" size="sm">← Back to campaigns</Btn>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col gap-6">
        {notice.error ? (
          <div role="alert" className="card" style={{ padding: "12px 16px", borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13.5 }}>{notice.error}</div>
        ) : notice.sent ? (
          <div role="status" className="card" style={{ padding: "12px 16px", fontSize: 13.5 }}>
            Sent to {notice.sent} recipient{notice.sent === "1" ? "" : "s"}.{Number(notice.failed) > 0 ? ` ${notice.failed} could not be sent — press Send again to retry them.` : ""}
          </div>
        ) : notice.tested ? (
          <div role="status" className="card" style={{ padding: "12px 16px", fontSize: 13.5 }}>Test email sent to {user.email}.</div>
        ) : notice.saved ? (
          <div role="status" className="card" style={{ padding: "12px 16px", fontSize: 13.5 }}>
            {campaign?.status === "scheduled" ? `Saved. Scheduled for ${fmtDate(campaign.scheduledAt)} (Lagos time).` : "Campaign saved."}
          </div>
        ) : null}
        <div className="grid gap-6 xl:grid-cols-[1.3fr_360px]">
          {/* ─── Main column ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Campaign details */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">
                Campaign details
              </div>
              <form action={saveBroadcastCampaignForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {!isNew && campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label className="label">Campaign name</label>
                    <input name="name" className="inp" defaultValue={campaign?.name ?? ""} required placeholder="e.g. Summer Sale Announcement" />
                  </div>
                  <div className="field">
                    <label className="label">Email subject</label>
                    <input name="subject" className="inp" defaultValue={campaign?.subject ?? ""} required placeholder="e.g. 🔥 30% off everything — this week only" />
                  </div>
                </div>

                {/* Email content */}
                <div className="mt-2">
                  <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">
                    Email content
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 mb-3">
                    <div className="field">
                      <label className="label">Use template (optional)</label>
                      <select name="templateId" className="sel" defaultValue={campaign?.templateId ?? ""}>
                        <option value="">None — custom HTML</option>
                        {emailTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} — {t.subject}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Schedule (optional, Lagos time)</label>
                      <input name="scheduledAt" type="datetime-local" className="inp" defaultValue={toLagosInputValue(campaign?.scheduledAt ?? null)} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">HTML body <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>— use <code>{`{{name}}`}</code> for buyer name, <code>{`{{store}}`}</code> for store name</span></label>
                    <textarea name="bodyHtml" className="ta" rows={14} defaultValue={campaign?.bodyHtml ?? ""}
                      placeholder={`<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">\n  <h1>Hi {{name}},</h1>\n  <p>Great news from {{store}}!</p>\n</div>`}
                      style={{ fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)", fontSize: 13, lineHeight: 1.6 }}
                    />
                  </div>
                </div>

                {/* Recipient filter */}
                <div className="mt-2">
                  <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">
                    Recipients
                  </div>
                  <div className="flex items-center gap-3 mb-3" style={{ fontSize: 13, color: "var(--ink-600)" }}>
                    <span>{Number(stats.unique)} unique buyers · {Number(stats.total)} orders · {store.currency} {Number(stats.spend).toLocaleString()} total revenue</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="filterMode" value="all" defaultChecked={!cfg.mode || cfg.mode === "all"} style={{ accentColor: "var(--teal-600)" }} />
                      Everyone — buyers and newsletter subscribers
                    </label>
                    <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="filterMode" value="subscribers" defaultChecked={cfg.mode === "subscribers"} style={{ accentColor: "var(--teal-600)" }} />
                      Newsletter subscribers only ({activeSubscribers})
                    </label>
                    <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="filterMode" value="min_orders" defaultChecked={cfg.mode === "min_orders"} style={{ accentColor: "var(--teal-600)" }} />
                      Minimum orders:
                      <input name="minOrders" type="number" className="inp" min="1" defaultValue={cfg.mode === "min_orders" ? cfg.value : 2}
                        style={{ width: 70, height: 28, fontSize: 12 }} />
                    </label>
                    <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="filterMode" value="min_spend" defaultChecked={cfg.mode === "min_spend"} style={{ accentColor: "var(--teal-600)" }} />
                      Minimum spend ({store.currency}):
                      <input name="minSpend" type="number" className="inp" min="0" step="100" defaultValue={cfg.mode === "min_spend" ? cfg.value : 10000}
                        style={{ width: 100, height: 28, fontSize: 12 }} />
                    </label>
                    <div style={{ marginTop: 4 }}>
                      <label className="flex items-start gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" name="filterMode" value="specific" defaultChecked={cfg.mode === "specific"} style={{ accentColor: "var(--teal-600)", marginTop: 3 }} />
                        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                          <span>Specific emails (one per line)</span>
                          <textarea name="filterEmails" className="inp" rows={3} defaultValue={cfg.mode === "specific" ? cfg.emails.join("\n") : ""}
                            placeholder="buyer@example.com&#10;another@example.com"
                            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, resize: "vertical", minHeight: 50 }} />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-3">
                  {editable ? <Btn type="submit" variant="mint">Save campaign</Btn> : null}
                  {editable ? (
                    <Btn type="submit" variant="primary" formAction={sendBroadcastCampaignForm}>Send now</Btn>
                  ) : null}
                  {!isNew && campaign ? (
                    <Btn type="submit" variant="ghost" style={{ color: "var(--danger)" }}
                      formAction={deleteBroadcastCampaignForm}>Delete</Btn>
                  ) : null}
                  <Link href="/home/marketing?tab=Campaigns" className="no-underline" style={{ marginLeft: "auto" }}>
                    <Btn variant="outline" size="sm">Cancel</Btn>
                  </Link>
                </div>
              </form>
            </Card>
          </div>

          {/* ─── Sidebar ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Status */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Status</div>
              {!isNew && campaign ? (
                <div className="flex flex-col gap-2 text-[14px]">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--color-muted)" }}>Status</span>
                    <Badge variant={campaign.status === "sent" ? "success" : campaign.status === "scheduled" ? "mint" : "soft"}>
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--color-muted)" }}>Sent</span>
                    <span>{campaign.sentCount}</span>
                  </div>
                  {[
                    ["Opens", `${campaign.openCount} · ${pct(campaign.openCount, campaign.sentCount)}`],
                    ["Clicks", `${campaign.clickCount} · ${pct(campaign.clickCount, campaign.sentCount)}`],
                    ["Orders", String(campaign.conversionCount)],
                    ["Revenue", `${store.currency} ${campaign.revenueGenerated.toLocaleString()}`],
                    ["Unsubscribes", String(campaign.unsubscribeCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span style={{ color: "var(--color-muted)" }}>{label}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                  {campaign.scheduledAt ? (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--color-muted)" }}>Scheduled</span>
                      <span>{fmtDate(campaign.scheduledAt)}</span>
                    </div>
                  ) : null}
                  {campaign.sentAt ? (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--color-muted)" }}>Sent at</span>
                      <span>{fmtDate(campaign.sentAt)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span style={{ color: "var(--color-muted)" }}>Created</span>
                    <span>{fmtDate(campaign.createdAt)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--color-muted)" }}>
                  Save the campaign to see status updates.
                </div>
              )}
            </Card>

            {/* Recipient summary */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Recipients</div>
              <div className="flex flex-col gap-1 text-[14px]">
                <div className="flex justify-between">
                  <span style={{ color: "var(--color-muted)" }}>Buyers</span>
                  <span style={{ fontWeight: 600 }}>{Number(stats.unique)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "var(--color-muted)" }}>Newsletter subscribers</span>
                  <span style={{ fontWeight: 600 }}>{activeSubscribers}</span>
                </div>
                {cfg.mode && cfg.mode !== "all" ? (
                  <div className="flex justify-between" style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--color-muted)" }}>Filtered to</span>
                    <span style={{ fontWeight: 600, color: "var(--teal-700)" }}>
                      {cfg.mode === "min_orders"
                        ? `${cfg.value}+ paid orders`
                        : cfg.mode === "min_spend"
                          ? `${store.currency} ${cfg.value.toLocaleString()}+ spent`
                          : cfg.mode === "subscribers"
                            ? "Subscribers only"
                            : `${cfg.emails.length} emails`}
                    </span>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* Send test */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Send test</div>
              <form action={testSendCampaignForm} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {!isNew && campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
                <input type="hidden" name="subject" value={campaign?.subject ?? ""} />
                <input type="hidden" name="bodyHtml" value={campaign?.bodyHtml ?? ""} />
                <div style={{ fontSize: 12.5, color: "var(--color-muted)", marginBottom: 6 }}>
                  Send a preview to yourself at <strong>{user.email}</strong>
                </div>
                <Btn type="submit" variant="outline" size="sm" style={{ width: "100%" }}>Send test email</Btn>
              </form>
            </Card>

            {/* Quick actions */}
            {!isNew && campaign && campaign.status === "sent" ? null : (
              <Card accent="var(--teal-600)">
                <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Quick actions</div>
                <div className="flex flex-col gap-2">
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                    Unsubscribed contacts are always skipped. Every email includes an unsubscribe link.
                  </div>
                  {!isNew && campaign && editable ? (
                    <form action={sendBroadcastCampaignForm} style={{ display: "contents" }}>
                      <input type="hidden" name="id" value={campaign.id} />
                      <Btn type="submit" variant="mint" size="sm" style={{ width: "100%" }}>Send campaign now</Btn>
                    </form>
                  ) : null}
                  {!isNew && campaign ? (
                    <form action={deleteBroadcastCampaignForm} style={{ display: "contents" }}>
                      <input type="hidden" name="id" value={campaign.id} />
                      <Btn type="submit" variant="ghost" size="sm" style={{ width: "100%", color: "var(--danger)" }}>Delete campaign</Btn>
                    </form>
                  ) : null}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
