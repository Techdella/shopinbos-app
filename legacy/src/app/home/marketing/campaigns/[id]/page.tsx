import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { TopBar } from "@/components/shell/TopBar";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import {
  saveBroadcastCampaign,
  sendBroadcastCampaign,
  deleteBroadcastCampaign,
  testSendCampaign,
} from "@/app/actions/marketing";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

type PageProps = { params: Promise<{ id: string }> };

async function saveBroadcastCampaignForm(formData: FormData) {
  "use server";
  await saveBroadcastCampaign(formData);
}

async function sendBroadcastCampaignForm(formData: FormData) {
  "use server";
  await sendBroadcastCampaign(formData);
}

async function deleteBroadcastCampaignForm(formData: FormData) {
  "use server";
  await deleteBroadcastCampaign(formData);
}

async function testSendCampaignForm(formData: FormData) {
  "use server";
  await testSendCampaign(formData);
}

export default async function CampaignEditorPage({ params }: PageProps) {
  const { id } = await params;
  const isNew = id === "new";
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true },
  });
  if (!store) redirect("/login");

  let campaign: {
    id: string; name: string; subject: string; bodyHtml: string;
    templateId: string | null; status: string; sentCount: number;
    openCount: number; recipientFilter: string; scheduledAt: Date | null;
    sentAt: Date | null; createdAt: Date;
  } | null = null;

  if (!isNew) {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string; name: string; subject: string; bodyHtml: string;
      templateId: string | null; status: string; sentCount: number;
      openCount: number; recipientFilter: string; scheduledAt: Date | null;
      sentAt: Date | null; createdAt: Date;
    }>>(
      `SELECT id, name, subject, "bodyHtml", "templateId", status, "sentCount", "openCount", "recipientFilter"::text, "scheduledAt", "sentAt", "createdAt" FROM "BroadcastCampaign" WHERE id = $1 AND "storeId" = $2`,
      id, store.id,
    );
    if (!rows || rows.length === 0) notFound();
    campaign = rows[0];
  }

  const emailTemplates = await db.$queryRawUnsafe<Array<{ id: string; name: string; subject: string }>>(
    `SELECT id, name, subject FROM "EmailTemplate" WHERE "storeId" = $1 ORDER BY name`, store.id,
  );

  const buyerStats = await db.$queryRawUnsafe<Array<{ total: bigint; unique: bigint; spend: number }>>(
    `SELECT COUNT(*)::bigint AS total, COUNT(DISTINCT "buyerEmail")::bigint AS unique, COALESCE(SUM(total), 0) AS spend FROM "RetailOrder" WHERE "storeId" = $1 AND "buyerEmail" IS NOT NULL`,
    store.id,
  );

  const stats = buyerStats[0] || { total: BigInt(0), unique: BigInt(0), spend: 0 };

  const cfg = campaign?.recipientFilter ? (() => { try { return JSON.parse(campaign.recipientFilter); } catch { return { mode: "all" }; } })() : { mode: "all" as string };

  return (
    <AppFrame role="seller" chipMode="rail" chipRole="seller">
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

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
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
                <input type="hidden" name="status" value="draft" />

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
                      <label className="label">Schedule (optional)</label>
                      <input name="scheduledAt" type="datetime-local" className="inp" defaultValue={campaign?.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : ""} />
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
                      All buyers ({Number(stats.unique)})
                    </label>
                    <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="filterMode" value="min_orders" defaultChecked={cfg.mode === "min_orders"} style={{ accentColor: "var(--teal-600)" }} />
                      Minimum orders:
                      <input name="filterValue" type="number" className="inp" min="1" defaultValue={cfg.mode === "min_orders" ? cfg.value ?? 2 : 2}
                        style={{ width: 70, height: 28, fontSize: 12 }} />
                    </label>
                    <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="filterMode" value="min_spend" defaultChecked={cfg.mode === "min_spend"} style={{ accentColor: "var(--teal-600)" }} />
                      Minimum spend ({store.currency}):
                      <input name="filterValue" type="number" className="inp" min="0" step="100" defaultValue={cfg.mode === "min_spend" ? cfg.value ?? 10000 : 10000}
                        style={{ width: 100, height: 28, fontSize: 12 }} />
                    </label>
                    <div style={{ marginTop: 4 }}>
                      <label className="flex items-start gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" name="filterMode" value="specific" defaultChecked={cfg.mode === "specific"} style={{ accentColor: "var(--teal-600)", marginTop: 3 }} />
                        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                          <span>Specific emails (one per line)</span>
                          <textarea name="filterEmails" className="inp" rows={3} defaultValue={cfg.mode === "specific" ? (cfg.emails ?? []).join("\n") : ""}
                            placeholder="buyer@example.com&#10;another@example.com"
                            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, resize: "vertical", minHeight: 50 }} />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-3">
                  <Btn type="submit" variant="mint">Save campaign</Btn>
                  {!isNew && campaign && campaign.status === "draft" ? (
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
                  <div className="flex justify-between">
                    <span style={{ color: "var(--color-muted)" }}>Opens</span>
                    <span>{campaign.openCount}</span>
                  </div>
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
                  <span style={{ color: "var(--color-muted)" }}>All buyers</span>
                  <span style={{ fontWeight: 600 }}>{Number(stats.unique)}</span>
                </div>
                {cfg.mode && cfg.mode !== "all" ? (
                  <div className="flex justify-between" style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--color-muted)" }}>Filtered to</span>
                    <span style={{ fontWeight: 600, color: "var(--teal-700)" }}>
                      {cfg.mode === "min_orders" ? `${cfg.value}+ orders` : cfg.mode === "min_spend" ? `${store.currency} ${Number(cfg.value).toLocaleString()}+` : `${(cfg.emails ?? []).length} emails`}
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
                  <form action={saveBroadcastCampaignForm} style={{ display: "contents" }}>
                    <input type="hidden" name="id" value={campaign?.id ?? ""} />
                    <input type="hidden" name="name" value={campaign?.name ?? ""} />
                    <input type="hidden" name="subject" value={campaign?.subject ?? ""} />
                    <input type="hidden" name="bodyHtml" value={campaign?.bodyHtml ?? ""} />
                    <input type="hidden" name="status" value="draft" />
                    <Btn type="submit" variant="outline" size="sm" style={{ width: "100%" }}>Save as draft</Btn>
                  </form>
                  {!isNew && campaign && campaign.status === "draft" ? (
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
