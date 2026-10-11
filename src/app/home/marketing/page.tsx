import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";
import {
  saveEmailTemplate,
  deleteEmailTemplate,
  saveAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  sendBroadcastCampaign,
  deleteBroadcastCampaign,
  saveDiscount,
  toggleDiscountStatus,
  deleteDiscount,
  generateCoupon,
  bulkImportCoupons,
} from "@/app/actions/marketing";

export const dynamic = "force-dynamic";

// Sending a campaign runs in this page's server action.
export const maxDuration = 300;

type PageProps = { searchParams?: Promise<{ tab?: string; action?: string; id?: string }> };

const AUTOMATION_TRIGGERS = [
  { value: "order_placed", label: "Order placed" },
  { value: "order_shipped", label: "Order shipped" },
  { value: "order_delivered", label: "Order delivered" },
  { value: "payment_received", label: "Payment received" },
  { value: "abandoned_checkout", label: "Abandoned checkout" },
  { value: "new_customer", label: "New customer" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Send email" },
  { value: "send_notification", label: "In-app notification" },
  { value: "update_discount", label: "Update discount" },
  { value: "add_tag", label: "Add customer tag" },
];

const DISCOUNT_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed_amount", label: "Fixed amount" },
  { value: "free_shipping", label: "Free shipping" },
  { value: "bogo", label: "BOGO" },
];

function fmtCurrency(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { dateStyle: "medium" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "warn" | "mint" | "soft"> = {
    active: "success",
    sent: "success",
    sending: "mint",
    draft: "soft",
    scheduled: "mint",
    disabled: "warn",
    expired: "warn",
    true: "success",
    false: "soft",
  };
  return <Badge variant={map[status] ?? "soft"}>{status}</Badge>;
}

async function saveEmailTemplateForm(formData: FormData) {
  "use server";
  await saveEmailTemplate(formData);
}

async function deleteEmailTemplateForm(formData: FormData) {
  "use server";
  await deleteEmailTemplate(formData);
}

async function saveAutomationRuleForm(formData: FormData) {
  "use server";
  await saveAutomationRule(formData);
}

async function deleteAutomationRuleForm(formData: FormData) {
  "use server";
  await deleteAutomationRule(formData);
}

async function toggleAutomationRuleForm(formData: FormData) {
  "use server";
  await toggleAutomationRule(formData);
}

async function sendBroadcastCampaignForm(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const result = await sendBroadcastCampaign(formData);
  // Report the outcome on the campaign page, which shows send results and errors.
  const query: Record<string, string> = result.error ? { error: result.error } : { sent: String(result.sent ?? 0), failed: String(result.failed ?? 0) };
  redirect(`/home/marketing/campaigns/${id}?${new URLSearchParams(query)}`);
}

async function deleteBroadcastCampaignForm(formData: FormData) {
  "use server";
  await deleteBroadcastCampaign(formData);
}

async function saveDiscountForm(formData: FormData) {
  "use server";
  await saveDiscount(formData);
}

async function toggleDiscountStatusForm(formData: FormData) {
  "use server";
  await toggleDiscountStatus(formData);
}

async function deleteDiscountForm(formData: FormData) {
  "use server";
  await deleteDiscount(formData);
}

async function generateCouponForm(formData: FormData) {
  "use server";
  await generateCoupon(formData);
}

async function bulkImportCouponsForm(formData: FormData) {
  "use server";
  await bulkImportCoupons(formData);
}

export default async function SellerMarketingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "Campaigns";
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined;
  const storeId = workspace?.store?.id;
  const currency = workspace?.store?.currency ?? "NGN";

  if (!storeId) return null;

  const [discounts, coupons, emailTemplates, automations, campaigns, discountStats] = await Promise.all([
    db.$queryRawUnsafe<Array<{ id: string; name: string; code: string; type: string; value: number; minOrder: number | null; maxUses: number; usedCount: number; status: string; expiresAt: Date | null }>>(
      `SELECT id, name, code, type, value, "minOrder", "maxUses", "usedCount", status, "expiresAt" FROM "Discount" WHERE "storeId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, storeId,
    ),
    db.$queryRawUnsafe<Array<{ id: string; code: string; type: string; value: number; minOrder: number | null; usedCount: number; status: string; expiresAt: Date | null }>>(
      `SELECT id, code, type, value, "minOrder", "usedCount", status, "expiresAt" FROM "Coupon" WHERE "storeId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, storeId,
    ),
    db.$queryRawUnsafe<Array<{ id: string; name: string; subject: string; category: string }>>(
      `SELECT id, name, subject, category FROM "EmailTemplate" WHERE "storeId" = $1 ORDER BY "updatedAt" DESC LIMIT 50`, storeId,
    ),
    db.$queryRawUnsafe<Array<{ id: string; name: string; description: string; trigger: string; actionType: string; actionConfig: string; active: boolean }>>(
      `SELECT id, name, description, trigger, "actionType", "actionConfig"::text, active FROM "AutomationRule" WHERE "storeId" = $1 ORDER BY "updatedAt" DESC LIMIT 50`, storeId,
    ),
    db.$queryRawUnsafe<Array<{ id: string; name: string; subject: string; status: string; sentCount: number; openCount: number; scheduledAt: Date | null; sentAt: Date | null }>>(
      `SELECT id, name, subject, status, "sentCount", "openCount", "scheduledAt", "sentAt" FROM "BroadcastCampaign" WHERE "storeId" = $1 ORDER BY "updatedAt" DESC LIMIT 50`, storeId,
    ),
    db.$queryRawUnsafe<Array<{ total_discounts: bigint; active_discounts: bigint; total_coupons: bigint; total_redemptions: bigint; revenue_impact: number }>>(
      `SELECT
        (SELECT COUNT(*)::bigint FROM "Discount" WHERE "storeId" = $1) AS total_discounts,
        (SELECT COUNT(*)::bigint FROM "Discount" WHERE "storeId" = $1 AND status = 'active') AS active_discounts,
        (SELECT COUNT(*)::bigint FROM "Coupon" WHERE "storeId" = $1) AS total_coupons,
        (SELECT COALESCE(SUM("usedCount"), 0)::bigint FROM "Discount" WHERE "storeId" = $1) + (SELECT COALESCE(SUM("usedCount"), 0)::bigint FROM "Coupon" WHERE "storeId" = $1) AS total_redemptions,
        (SELECT COALESCE(SUM("discountAmount"), 0) FROM "RetailOrder" WHERE "storeId" = $1 AND "discountAmount" > 0) AS revenue_impact
      FROM "Discount" WHERE "storeId" = $1 LIMIT 1`, storeId,
    ),
  ]);
  const ds = discountStats?.[0];

  const offers = [
    ...discounts.map((d) => ({
      id: d.id, code: d.code, type: d.type.replace(/_/g, " "),
      value: d.type === "percentage" ? `${d.value}% off` : d.type === "free_shipping" ? "Free delivery" : fmtCurrency(d.value, currency),
      uses: `${d.usedCount}${d.maxUses > 0 ? `/${d.maxUses}` : ""}`,
      expires: fmtDate(d.expiresAt), status: d.status, kind: "discount" as const,
    })),
    ...coupons.map((c) => ({
      id: c.id, code: c.code, type: c.type.replace(/_/g, " "),
      value: c.type === "percentage" ? `${c.value}% off` : fmtCurrency(c.value, currency),
      uses: `${c.usedCount}`,
      expires: fmtDate(c.expiresAt), status: c.status, kind: "coupon" as const,
    })),
  ];

  return (
    <AppFrame role="seller" storeName={storeName} storeSlug={storeSlug} storeInitial={storeName.charAt(0).toUpperCase()} userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)} avatarUrl={user.avatarUrl} userEmail={user.email}>
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Marketing" sub="Email campaigns, automations, templates, and discounts" />

        <div className="design-tabs">
          {["Campaigns", "Automations", "Email Templates", "Discounts & Coupons", "Social Selling"].map((tab) => (
            <a key={tab} href={`/home/marketing?tab=${encodeURIComponent(tab)}`} className={`tab${tab === activeTab ? " on" : ""}`} style={{ textDecoration: "none", cursor: "pointer" }}>
              {tab}
            </a>
          ))}
        </div>

        {/* ─── CAMPAIGNS TAB ─────────────────────────────────────────────── */}
        {activeTab === "Campaigns" && (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <a href="/home/marketing/campaigns/new" className="dbtn dBtn-mint"><Icon name="plus" size={14} /> New campaign</a>
              <RexAICopywriter storeName={storeName} />
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Name</th><th>Subject</th><th>Sent</th><th>Opens</th><th>Status</th><th>Scheduled</th><th></th></tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ fontSize: 12.5, color: "var(--ink-600)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</td>
                      <td>{c.sentCount}</td>
                      <td>{c.openCount}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td style={{ fontSize: 12 }}>{c.scheduledAt ? fmtDate(c.scheduledAt) : fmtDate(c.sentAt)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          {c.status === "draft" || c.status === "scheduled" ? (
                            <>
                              <a href={`/home/marketing/campaigns/${c.id}`} className="dbtn dBtn-ghost dBtn-xs">Edit</a>
                              <form action={sendBroadcastCampaignForm} style={{ display: "inline" }}>
                                <input type="hidden" name="id" value={c.id} />
                                <button type="submit" className="dbtn dBtn-mint dBtn-xs">Send</button>
                              </form>
                            </>
                          ) : null}
                          {c.status === "sent" ? (
                            <a href={`/home/marketing/campaigns/${c.id}`} className="dbtn dBtn-ghost dBtn-xs">View</a>
                          ) : null}
                          <form action={deleteBroadcastCampaignForm} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="dbtn dBtn-ghost dBtn-xs" style={{ color: "var(--danger)" }}>Delete</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {campaigns.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-500)", padding: 28 }}>No campaigns yet. Create your first broadcast campaign.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── AUTOMATIONS TAB ───────────────────────────────────────────── */}
        {activeTab === "Automations" && (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <a href={`/home/marketing?tab=Automations&action=new`} className="dbtn dBtn-mint"><Icon name="plus" size={14} /> New automation</a>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Name</th><th>Trigger</th><th>Action</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {automations.map((a) => {
                    const cfg = (() => { try { return JSON.parse(a.actionConfig); } catch { return {}; } })();
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td style={{ fontSize: 12.5, color: "var(--ink-600)" }}>{AUTOMATION_TRIGGERS.find((t) => t.value === a.trigger)?.label ?? a.trigger}</td>
                        <td style={{ fontSize: 12.5, color: "var(--ink-600)" }}>{ACTION_TYPES.find((t) => t.value === a.actionType)?.label ?? a.actionType}{cfg.subject ? `: ${cfg.subject}` : ""}</td>
                        <td>
                          <form action={toggleAutomationRuleForm} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="active" value={String(!a.active)} />
                            <button type="submit" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              <StatusBadge status={String(a.active)} />
                            </button>
                          </form>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <a href={`/home/marketing?tab=Automations&action=edit&id=${a.id}`} className="dbtn dBtn-ghost dBtn-xs">Edit</a>
                            <form action={deleteAutomationRuleForm} style={{ display: "inline" }}>
                              <input type="hidden" name="id" value={a.id} />
                              <button type="submit" className="dbtn dBtn-ghost dBtn-xs" style={{ color: "var(--danger)" }}>Delete</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {automations.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-500)", padding: 28 }}>No automations yet. Create one to automate your workflow.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {params?.action === "new" || params?.action === "edit" ? (
              <details open className="card" style={{ padding: 20 }}>
                <summary style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>{params.action === "new" ? "New automation rule" : "Edit automation"}</summary>
                <form action={saveAutomationRuleForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {params.action === "edit" && params.id ? <input type="hidden" name="id" value={params.id} /> : null}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Rule name</label><input name="name" className="inp" required /></div>
                    <div className="field"><label className="label">Trigger event</label>
                      <select name="trigger" className="sel" required>
                        <option value="">Select trigger...</option>
                        {AUTOMATION_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="field"><label className="label">Action type</label>
                      <select name="actionType" className="sel" required>
                        <option value="">Select action...</option>
                        {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field"><label className="label">Description (optional)</label><input name="description" className="inp" placeholder="What should this automation do?" /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Email template (for send_email action)</label>
                      <select name="templateId" className="sel">
                        <option value="">None — use custom</option>
                        {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="field"><label className="label">Notification channel</label>
                      <select name="channel" className="sel">
                        <option value="email">Email</option>
                        <option value="in_app">In-app</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Custom subject (overrides template)</label><input name="customSubject" className="inp" /></div>
                    <div className="field"><label className="label">Custom body preview</label><input name="customBody" className="inp" /></div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" name="active" value="true" defaultChecked style={{ accentColor: "var(--teal-600)" }} /> Active on save</label>
                  <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Save automation</button>
                </form>
              </details>
            ) : null}

            <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--teal-100))" }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <MascotAvatar role="seller" size={34} />
                <div>
                  <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Peggy tip</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-800)" }}>
                    Order confirmation emails run automatically. Create custom automations for shipping updates, payment receipts, and abandoned cart recovery.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── EMAIL TEMPLATES TAB ───────────────────────────────────────── */}
        {activeTab === "Email Templates" && (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <a href={`/home/marketing?tab=Email+Templates&action=new`} className="dbtn dBtn-mint"><Icon name="plus" size={14} /> New template</a>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Name</th><th>Subject</th><th>Category</th><th></th></tr>
                </thead>
                <tbody>
                  {emailTemplates.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td style={{ fontSize: 12.5, color: "var(--ink-600)" }}>{t.subject}</td>
                      <td><Badge variant="soft">{t.category}</Badge></td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <a href={`/home/marketing?tab=Email+Templates&action=edit&id=${t.id}`} className="dbtn dBtn-ghost dBtn-xs">Edit</a>
                          <form action={deleteEmailTemplateForm} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={t.id} />
                            <button type="submit" className="dbtn dBtn-ghost dBtn-xs" style={{ color: "var(--danger)" }}>Delete</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {emailTemplates.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-500)", padding: 28 }}>No email templates yet. Create your first template.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {params?.action === "new" || params?.action === "edit" ? (
              <details open className="card" style={{ padding: 20 }}>
                <summary style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>{params.action === "new" ? "New email template" : "Edit template"}</summary>
                <form action={saveEmailTemplateForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {params.action === "edit" && params.id ? <input type="hidden" name="id" value={params.id} /> : null}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Template name</label><input name="name" className="inp" required /></div>
                    <div className="field"><label className="label">Email subject</label><input name="subject" className="inp" required /></div>
                    <div className="field"><label className="label">Category</label>
                      <select name="category" className="sel">
                        <option value="general">General</option>
                        <option value="order">Order</option>
                        <option value="marketing">Marketing</option>
                        <option value="newsletter">Newsletter</option>
                      </select>
                    </div>
                  </div>
                  <div className="field"><label className="label">HTML body</label>
                    <textarea name="bodyHtml" className="ta" rows={10} placeholder={`<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">\n  <h1>{{subject}}</h1>\n  <p>Your content here.</p>\n</div>`} /></div>
                  <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Save template</button>
                </form>
              </details>
            ) : null}
          </>
        )}

        {/* ─── DISCOUNTS & COUPONS TAB ───────────────────────────────────── */}
        {activeTab === "Discounts & Coupons" && (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href={`/home/marketing?tab=Discounts+%26+Coupons&action=new-discount`} className="dbtn dBtn-mint"><Icon name="plus" size={14} /> New discount</a>
              <a href={`/home/marketing?tab=Discounts+%26+Coupons&action=generate-coupon`} className="dbtn dBtn-ghost"><Icon name="code" size={14} /> Generate coupon</a>
              <a href={`/home/marketing?tab=Discounts+%26+Coupons&action=bulk-import`} className="dbtn dBtn-ghost"><Icon name="upload" size={14} /> Bulk import</a>
            </div>

            {ds ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "Discounts", value: String(Number(ds.total_discounts)), sub: `${Number(ds.active_discounts)} active`, color: "var(--teal-600)" },
                  { label: "Coupons", value: String(Number(ds.total_coupons)), sub: "total codes", color: "var(--berry-500)" },
                  { label: "Redemptions", value: String(Number(ds.total_redemptions)), sub: "times used", color: "var(--amber-600)" },
                  { label: "Revenue impact", value: fmtCurrency(ds.revenue_impact, currency), sub: "total given away", color: "var(--coral-500)" },
                ].map((s) => (
                  <div key={s.label} className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${s.color}` }}>
                    <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: "var(--ink-900)" }}>{s.value}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 1 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Code</th><th>Type</th><th>Value</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={`${o.kind}-${o.id}`}>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12.5 }}>{o.code}</td>
                      <td style={{ fontSize: 12.5, color: "var(--ink-600)" }}>{o.type}</td>
                      <td style={{ fontWeight: 600 }}>{o.value}</td>
                      <td style={{ fontSize: 12.5 }}>{o.uses}</td>
                      <td style={{ fontSize: 12.5 }}>{o.expires}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          {o.kind === "discount" ? (
                            <>
                              <form action={toggleDiscountStatusForm} style={{ display: "inline" }}>
                                <input type="hidden" name="id" value={o.id} />
                                <input type="hidden" name="status" value={o.status === "active" ? "disabled" : "active"} />
                                <button type="submit" className="dbtn dBtn-ghost dBtn-xs">{o.status === "active" ? "Disable" : "Enable"}</button>
                              </form>
                              <form action={deleteDiscountForm} style={{ display: "inline" }}>
                                <input type="hidden" name="id" value={o.id} />
                                <button type="submit" className="dbtn dBtn-ghost dBtn-xs" style={{ color: "var(--danger)" }}>Delete</button>
                              </form>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {offers.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-500)", padding: 28 }}>No discounts or coupons yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {params?.action === "new-discount" ? (
              <details open className="card" style={{ padding: 20 }}>
                <summary style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>New discount</summary>
                <form action={saveDiscountForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Discount name</label><input name="name" className="inp" required /></div>
                    <div className="field"><label className="label">Code</label><input name="code" className="inp" required placeholder="SUMMER25" /></div>
                    <div className="field"><label className="label">Type</label>
                      <select name="type" className="sel" required>
                        {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Value</label><input name="value" type="number" step="0.01" className="inp" required /></div>
                    <div className="field"><label className="label">Min. order amount</label><input name="minOrder" type="number" step="0.01" className="inp" defaultValue="0" /></div>
                    <div className="field"><label className="label">Max uses (0 = unlimited)</label><input name="maxUses" type="number" className="inp" defaultValue="0" /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Status</label>
                      <select name="status" className="sel">
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    </div>
                    <div className="field"><label className="label">Expires at</label><input name="expiresAt" type="datetime-local" className="inp" /></div>
                  </div>
                  <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Create discount</button>
                </form>
              </details>
            ) : null}

            {params?.action === "generate-coupon" ? (
              <details open className="card" style={{ padding: 20 }}>
                <summary style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>Generate coupon codes</summary>
                <form action={generateCouponForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Type</label>
                      <select name="type" className="sel">
                        {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="field"><label className="label">Value</label><input name="value" type="number" step="0.01" className="inp" required /></div>
                    <div className="field"><label className="label">Count</label><input name="count" type="number" className="inp" defaultValue="1" min="1" max="50" /></div>
                  </div>
                  <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Generate</button>
                </form>
              </details>
            ) : null}

            {params?.action === "bulk-import" ? (
              <details open className="card" style={{ padding: 20 }}>
                <summary style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>Bulk import coupon codes</summary>
                <form action={bulkImportCouponsForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="field"><label className="label">Type</label>
                      <select name="type" className="sel">
                        {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="field"><label className="label">Value</label><input name="value" type="number" step="0.01" className="inp" required /></div>
                  </div>
                  <div className="field"><label className="label">Codes (one per line)</label>
                    <textarea name="codes" className="ta" rows={6} placeholder={`SUMMER25&#10;WELCOME10&#10;FREESHIP&#10;VIP20OFF`}
                      style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }} />
                  </div>
                  <button type="submit" className="dbtn dBtn-mint" style={{ alignSelf: "flex-start" }}>Import codes</button>
                </form>
              </details>
            ) : null}
          </>
        )}

        {/* ─── SOCIAL SELLING TAB ────────────────────────────────────────── */}
        {activeTab === "Social Selling" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {[
                { name: "WhatsApp Business", icon: "whatsapp", color: "#25d366" },
                { name: "Instagram Shopping", icon: "instagram", color: "var(--berry-500)" },
                { name: "TikTok Shop", icon: "tiktok", color: "var(--ink-900)" },
                { name: "Facebook Shop", icon: "facebook", color: "#1877F2" },
              ].map((ch) => (
                <div key={ch.name} className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12, opacity: 0.86 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${ch.color}1a`, color: ch.color, display: "grid", placeItems: "center" }}>
                    <Icon name={ch.icon as any} size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-900)" }}>{ch.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>Coming soon</div>
                  </div>
                  <Badge variant="warn" dot>Soon</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
