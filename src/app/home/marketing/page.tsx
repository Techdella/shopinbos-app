import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";
import { ConfirmSubmit } from "@/components/growth/ConfirmSubmit";
import { Field, buttonClass, checkClass, formatDate, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
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

type PageProps = { searchParams?: Promise<{ tab?: string; action?: string; id?: string; error?: string; done?: string }> };

const TABS = ["Campaigns", "Automations", "Email Templates", "Discounts & Coupons", "Social Selling"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  Campaigns: "Campaigns",
  Automations: "Automations",
  "Email Templates": "Email templates",
  "Discounts & Coupons": "Discounts and coupons",
  "Social Selling": "Social selling",
};

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
  { value: "percentage", label: "Percentage off" },
  { value: "fixed_amount", label: "Amount off" },
  { value: "free_shipping", label: "Free delivery" },
  { value: "bogo", label: "Buy one, get one" },
];

const STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "success", label: "Live" },
  sent: { tone: "success", label: "Sent" },
  sending: { tone: "info", label: "Sending" },
  scheduled: { tone: "info", label: "Scheduled" },
  draft: { tone: "muted", label: "Draft" },
  disabled: { tone: "warning", label: "Off" },
  expired: { tone: "warning", label: "Expired" },
  used: { tone: "muted", label: "Used" },
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS[status] ?? { tone: "muted" as Tone, label: status.charAt(0).toUpperCase() + status.slice(1) };
  return <Pill tone={style.tone}>{style.label}</Pill>;
}

function fmtCurrency(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function tabHref(tab: string, extra: Record<string, string> = {}) {
  return `/home/marketing?${new URLSearchParams({ tab, ...extra })}`;
}

/** Runs a marketing action and comes back to the tab, with the action's error if it returned one. */
async function runAndReturn(tab: string, formData: FormData, run: (formData: FormData) => Promise<unknown>, done?: string) {
  const result = (await run(formData)) as { error?: string } | undefined;
  redirect(tabHref(tab, result?.error ? { error: result.error } : done ? { done } : {}));
}

async function saveEmailTemplateForm(formData: FormData) {
  "use server";
  await runAndReturn("Email Templates", formData, saveEmailTemplate, "Template saved.");
}

async function deleteEmailTemplateForm(formData: FormData) {
  "use server";
  await deleteEmailTemplate(formData);
}

async function saveAutomationRuleForm(formData: FormData) {
  "use server";
  await runAndReturn("Automations", formData, saveAutomationRule, "Automation saved.");
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
  await runAndReturn("Discounts & Coupons", formData, saveDiscount, "Discount created.");
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
  const result = (await generateCoupon(formData)) as { error?: string; codes?: string[] };
  redirect(tabHref("Discounts & Coupons", result.error ? { error: result.error } : { done: `Made ${result.codes?.length ?? 0} code${result.codes?.length === 1 ? "" : "s"}: ${(result.codes ?? []).join(", ")}` }));
}

async function bulkImportCouponsForm(formData: FormData) {
  "use server";
  const result = (await bulkImportCoupons(formData)) as { error?: string; imported?: number };
  redirect(tabHref("Discounts & Coupons", result.error ? { error: result.error } : { done: `Imported ${result.imported ?? 0} code${result.imported === 1 ? "" : "s"}.` }));
}

function FormCard({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <CardHead title={title} action={<a href={closeHref} className="text-[14px] font-bold text-app-ink-soft no-underline hover:text-app-ink">Close</a>} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">{children}</div>;
}

export default async function SellerMarketingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeTab = (TABS as readonly string[]).includes(params?.tab ?? "") ? (params!.tab as (typeof TABS)[number]) : "Campaigns";
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  if (!store) return null;
  const storeId = store.id;
  const currency = store.currency ?? "NGN";

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
    // No FROM clause: the counts must come back even when the store has no discounts yet.
    db.$queryRawUnsafe<Array<{ total_discounts: bigint; active_discounts: bigint; total_coupons: bigint; total_redemptions: bigint; revenue_impact: number }>>(
      `SELECT
        (SELECT COUNT(*)::bigint FROM "Discount" WHERE "storeId" = $1) AS total_discounts,
        (SELECT COUNT(*)::bigint FROM "Discount" WHERE "storeId" = $1 AND status = 'active') AS active_discounts,
        (SELECT COUNT(*)::bigint FROM "Coupon" WHERE "storeId" = $1) AS total_coupons,
        (SELECT COALESCE(SUM("usedCount"), 0)::bigint FROM "Discount" WHERE "storeId" = $1) + (SELECT COALESCE(SUM("usedCount"), 0)::bigint FROM "Coupon" WHERE "storeId" = $1) AS total_redemptions,
        (SELECT COALESCE(SUM("discountAmount"), 0) FROM "RetailOrder" WHERE "storeId" = $1 AND "discountAmount" > 0) AS revenue_impact`, storeId,
    ),
  ]);
  const ds = discountStats?.[0];

  const editingTemplate = activeTab === "Email Templates" && params?.action === "edit" && params.id
    ? (await db.$queryRawUnsafe<Array<{ id: string; name: string; subject: string; category: string; bodyHtml: string | null }>>(
        `SELECT id, name, subject, category, "bodyHtml" FROM "EmailTemplate" WHERE id = $1 AND "storeId" = $2 LIMIT 1`, params.id, storeId,
      ))[0] ?? null
    : null;
  const editingRule = activeTab === "Automations" && params?.action === "edit" && params.id ? automations.find((rule) => rule.id === params.id) ?? null : null;
  const editingRuleConfig = (() => {
    try {
      return editingRule ? (JSON.parse(editingRule.actionConfig) as Record<string, string>) : {};
    } catch {
      return {};
    }
  })();

  const offers = [
    ...discounts.map((d) => ({
      id: d.id, code: d.code, name: d.name, type: d.type.replace(/_/g, " "),
      value: d.type === "percentage" ? `${d.value}% off` : d.type === "free_shipping" ? "Free delivery" : `${fmtCurrency(d.value, currency)} off`,
      uses: `${d.usedCount}${d.maxUses > 0 ? ` of ${d.maxUses}` : ""} used`,
      expires: d.expiresAt ? `Ends ${formatDate(d.expiresAt)}` : "No end date", status: d.status, kind: "discount" as const,
    })),
    ...coupons.map((c) => ({
      id: c.id, code: c.code, name: "Coupon code", type: c.type.replace(/_/g, " "),
      value: c.type === "percentage" ? `${c.value}% off` : `${fmtCurrency(c.value, currency)} off`,
      uses: `${c.usedCount} used`,
      expires: c.expiresAt ? `Ends ${formatDate(c.expiresAt)}` : "No end date", status: c.status, kind: "coupon" as const,
    })),
  ];

  const emailsSent = campaigns.reduce((sum, campaign) => sum + campaign.sentCount, 0);
  const opens = campaigns.reduce((sum, campaign) => sum + campaign.openCount, 0);
  const counts: Record<(typeof TABS)[number], number | undefined> = {
    Campaigns: campaigns.length,
    Automations: automations.length,
    "Email Templates": emailTemplates.length,
    "Discounts & Coupons": offers.length,
    "Social Selling": undefined,
  };
  const close = tabHref(activeTab);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Marketing"
      sub="Email campaigns, automations, templates and discounts in one place."
      actions={
        <>
          <RexAICopywriter storeName={store.name} />
          <PillLink href="/home/marketing/campaigns/new" tone="accent" icon="plus">New campaign</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        {params?.error && <Notice>{params.error}</Notice>}
        {params?.done && <Notice tone="success">{params.done}</Notice>}

        <StatGrid>
          <StatTile tone="card" label="Campaigns" value={campaigns.length} hint={`${campaigns.filter((c) => c.status === "sent").length} sent`} />
          <StatTile tone="card" label="Emails sent" value={emailsSent.toLocaleString("en-NG")} hint={emailsSent ? `${Math.round((opens / emailsSent) * 100)}% opened` : "No emails sent yet"} />
          <StatTile tone="card" label="Live discounts" value={Number(ds?.active_discounts ?? 0)} hint={`${Number(ds?.total_redemptions ?? 0)} times used`} />
          <StatTile tone="card" label="Given away in discounts" value={fmtCurrency(Number(ds?.revenue_impact ?? 0), currency)} hint="Across all orders" />
        </StatGrid>

        <nav aria-label="Marketing tools" className="flex flex-wrap gap-2">
          {([
            ["/home/marketing/subscribers", "Subscribers", "users"],
            ["/home/marketing/segments", "Segments", "layers"],
            ["/home/marketing/forms", "Forms and popups", "mail"],
            ["/home/marketing/chat", "Live chat", "message"],
            ["/home/marketing/analytics", "Analytics", "chart"],
            ["/home/discounts", "Discounts", "percent"],
          ] as Array<[string, string, IconName]>).map(([href, label, icon]) => (
            <PillLink key={href} href={href} size="sm" icon={icon}>{label}</PillLink>
          ))}
        </nav>

        <FilterChips items={TABS.map((tab) => ({ label: TAB_LABEL[tab], href: tabHref(tab), count: counts[tab], active: tab === activeTab }))} />

        {/* Campaigns */}
        {activeTab === "Campaigns" && (
          campaigns.length ? (
            <ListCard>
              {campaigns.map((c) => (
                <ListRow key={c.id}>
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <a href={`/home/marketing/campaigns/${c.id}`} className="block truncate text-[15px] font-extrabold text-app-ink no-underline hover:underline">{c.name}</a>
                    <div className="truncate text-[13px] text-app-ink-soft">{c.subject}</div>
                  </div>
                  <div className="text-[13px] text-app-ink-soft sm:w-[160px]">
                    {c.sentCount.toLocaleString("en-NG")} sent · {c.openCount.toLocaleString("en-NG")} opened
                    <div>{c.scheduledAt ? `For ${formatDate(c.scheduledAt)}` : c.sentAt ? formatDate(c.sentAt) : "Not sent"}</div>
                  </div>
                  <StatusPill status={c.status} />
                  <RowActions>
                    {c.status === "draft" || c.status === "scheduled" ? (
                      <>
                        <a href={`/home/marketing/campaigns/${c.id}`} className={buttonClass("white", "sm")}>Edit</a>
                        <form action={sendBroadcastCampaignForm}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmit message={`Send "${c.name}" now?`} className={buttonClass("ink", "sm")}>Send</ConfirmSubmit>
                        </form>
                      </>
                    ) : (
                      <a href={`/home/marketing/campaigns/${c.id}`} className={buttonClass("white", "sm")}>View</a>
                    )}
                    <form action={deleteBroadcastCampaignForm}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmSubmit message={`Delete "${c.name}"?`} className={buttonClass("danger", "sm")}>Delete</ConfirmSubmit>
                    </form>
                  </RowActions>
                </ListRow>
              ))}
            </ListCard>
          ) : (
            <EmptyState icon="send" title="No campaigns yet" action={<PillLink href="/home/marketing/campaigns/new" tone="ink" icon="plus">New campaign</PillLink>}>
              Write one email and send it to your buyers and newsletter subscribers.
            </EmptyState>
          )
        )}

        {/* Automations */}
        {activeTab === "Automations" && (
          <>
            <div className="flex flex-wrap gap-2">
              <PillLink href={tabHref("Automations", { action: "new" })} tone="ink" icon="plus">New automation</PillLink>
            </div>

            {(params?.action === "new" || editingRule) && (
              <FormCard title={editingRule ? `Edit ${editingRule.name}` : "New automation"} closeHref={close}>
                <form action={saveAutomationRuleForm} className="grid gap-4">
                  {editingRule && <input type="hidden" name="id" value={editingRule.id} />}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name" htmlFor="auto-name"><input id="auto-name" name="name" className={inputClass} required defaultValue={editingRule?.name ?? ""} /></Field>
                    <Field label="When this happens" htmlFor="auto-trigger">
                      <select id="auto-trigger" name="trigger" className={selectClass} required defaultValue={editingRule?.trigger ?? ""}>
                        <option value="">Choose</option>
                        {AUTOMATION_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Do this" htmlFor="auto-action">
                      <select id="auto-action" name="actionType" className={selectClass} required defaultValue={editingRule?.actionType ?? ""}>
                        <option value="">Choose</option>
                        {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Description (optional)" htmlFor="auto-desc"><input id="auto-desc" name="description" className={inputClass} placeholder="What should this automation do?" defaultValue={editingRule?.description ?? ""} /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email template (for Send email)" htmlFor="auto-template">
                      <select id="auto-template" name="templateId" className={selectClass} defaultValue={editingRuleConfig.templateId ?? ""}>
                        <option value="">None, write my own</option>
                        {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Send by" htmlFor="auto-channel">
                      <select id="auto-channel" name="channel" className={selectClass} defaultValue={editingRuleConfig.channel ?? "email"}>
                        <option value="email">Email</option>
                        <option value="in_app">In the app</option>
                        <option value="both">Both</option>
                      </select>
                    </Field>
                    <Field label="Subject (replaces the template's)" htmlFor="auto-subject"><input id="auto-subject" name="customSubject" className={inputClass} defaultValue={editingRuleConfig.subject ?? ""} /></Field>
                    <Field label="Message preview" htmlFor="auto-body"><input id="auto-body" name="customBody" className={inputClass} defaultValue={editingRuleConfig.body ?? ""} /></Field>
                  </div>
                  <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] font-semibold">
                    <input type="checkbox" name="active" value="true" defaultChecked={editingRule ? editingRule.active : true} className={checkClass} /> Turn on when saved
                  </label>
                  <div><button type="submit" className={buttonClass("ink")}>Save automation</button></div>
                </form>
              </FormCard>
            )}

            {automations.length ? (
              <ListCard>
                {automations.map((a) => {
                  const cfg = (() => { try { return JSON.parse(a.actionConfig) as Record<string, string>; } catch { return {} as Record<string, string>; } })();
                  return (
                    <ListRow key={a.id}>
                      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <div className="truncate text-[15px] font-extrabold">{a.name}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          When {(AUTOMATION_TRIGGERS.find((t) => t.value === a.trigger)?.label ?? a.trigger).toLowerCase()}: {(ACTION_TYPES.find((t) => t.value === a.actionType)?.label ?? a.actionType).toLowerCase()}{cfg.subject ? `, "${cfg.subject}"` : ""}
                        </div>
                      </div>
                      <Pill tone={a.active ? "success" : "muted"} dot>{a.active ? "On" : "Off"}</Pill>
                      <RowActions>
                        <form action={toggleAutomationRuleForm}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="active" value={String(!a.active)} />
                          <button type="submit" className={buttonClass("white", "sm")}>{a.active ? "Turn off" : "Turn on"}</button>
                        </form>
                        <a href={tabHref("Automations", { action: "edit", id: a.id })} className={buttonClass("white", "sm")}>Edit</a>
                        <form action={deleteAutomationRuleForm}>
                          <input type="hidden" name="id" value={a.id} />
                          <ConfirmSubmit message={`Delete "${a.name}"?`} className={buttonClass("danger", "sm")}>Delete</ConfirmSubmit>
                        </form>
                      </RowActions>
                    </ListRow>
                  );
                })}
              </ListCard>
            ) : (
              <EmptyState icon="automation" title="No automations yet">Make one to send shipping updates, payment receipts or abandoned cart reminders on their own.</EmptyState>
            )}

            <AssistantNote>Order confirmation emails already go out on their own. Add automations for shipping updates, payment receipts and abandoned carts.</AssistantNote>
          </>
        )}

        {/* Email templates */}
        {activeTab === "Email Templates" && (
          <>
            <div className="flex flex-wrap gap-2">
              <PillLink href={tabHref("Email Templates", { action: "new" })} tone="ink" icon="plus">New template</PillLink>
            </div>

            {(params?.action === "new" || editingTemplate) && (
              <FormCard title={editingTemplate ? `Edit ${editingTemplate.name}` : "New email template"} closeHref={close}>
                <form action={saveEmailTemplateForm} className="grid gap-4">
                  {editingTemplate && <input type="hidden" name="id" value={editingTemplate.id} />}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Template name" htmlFor="tpl-name"><input id="tpl-name" name="name" className={inputClass} required defaultValue={editingTemplate?.name ?? ""} /></Field>
                    <Field label="Email subject" htmlFor="tpl-subject"><input id="tpl-subject" name="subject" className={inputClass} required defaultValue={editingTemplate?.subject ?? ""} /></Field>
                    <Field label="Kind" htmlFor="tpl-category">
                      <select id="tpl-category" name="category" className={selectClass} defaultValue={editingTemplate?.category ?? "general"}>
                        <option value="general">General</option>
                        <option value="order">Order</option>
                        <option value="marketing">Marketing</option>
                        <option value="newsletter">Newsletter</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Email body (HTML)" htmlFor="tpl-body">
                    <textarea id="tpl-body" name="bodyHtml" className={`${textareaClass} font-mono text-[13px]`} rows={10} defaultValue={editingTemplate?.bodyHtml ?? ""} placeholder={`<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">\n  <h1>{{subject}}</h1>\n  <p>Your content here.</p>\n</div>`} />
                  </Field>
                  <div><button type="submit" className={buttonClass("ink")}>Save template</button></div>
                </form>
              </FormCard>
            )}

            {emailTemplates.length ? (
              <ListCard>
                {emailTemplates.map((t) => (
                  <ListRow key={t.id}>
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <div className="truncate text-[15px] font-extrabold">{t.name}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">{t.subject}</div>
                    </div>
                    <Pill tone="muted">{t.category.charAt(0).toUpperCase() + t.category.slice(1)}</Pill>
                    <RowActions>
                      <a href={tabHref("Email Templates", { action: "edit", id: t.id })} className={buttonClass("white", "sm")}>Edit</a>
                      <form action={deleteEmailTemplateForm}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmit message={`Delete "${t.name}"?`} className={buttonClass("danger", "sm")}>Delete</ConfirmSubmit>
                      </form>
                    </RowActions>
                  </ListRow>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="mail" title="No email templates yet">Save a layout once and reuse it for campaigns and automations.</EmptyState>
            )}
          </>
        )}

        {/* Discounts and coupons */}
        {activeTab === "Discounts & Coupons" && (
          <>
            <div className="flex flex-wrap gap-2">
              <PillLink href={tabHref("Discounts & Coupons", { action: "new-discount" })} tone="ink" icon="plus">New discount</PillLink>
              <PillLink href={tabHref("Discounts & Coupons", { action: "generate-coupon" })} icon="code">Make coupon codes</PillLink>
              <PillLink href={tabHref("Discounts & Coupons", { action: "bulk-import" })} icon="upload">Import codes</PillLink>
            </div>

            <StatGrid>
              <StatTile tone="card" label="Discounts" value={Number(ds?.total_discounts ?? 0)} hint={`${Number(ds?.active_discounts ?? 0)} live`} />
              <StatTile tone="card" label="Coupon codes" value={Number(ds?.total_coupons ?? 0)} />
              <StatTile tone="card" label="Times used" value={Number(ds?.total_redemptions ?? 0)} />
              <StatTile tone="card" label="Given away" value={fmtCurrency(Number(ds?.revenue_impact ?? 0), currency)} />
            </StatGrid>

            {params?.action === "new-discount" && (
              <FormCard title="New discount" closeHref={close}>
                <form action={saveDiscountForm} className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name" htmlFor="disc-name"><input id="disc-name" name="name" className={inputClass} required /></Field>
                    <Field label="Code" htmlFor="disc-code"><input id="disc-code" name="code" className={`${inputClass} uppercase`} required placeholder="SUMMER25" /></Field>
                    <Field label="Kind" htmlFor="disc-type">
                      <select id="disc-type" name="type" className={selectClass} required>
                        {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Value" htmlFor="disc-value" hint="A percentage or an amount in naira."><input id="disc-value" name="value" type="number" step="0.01" min="0" className={inputClass} required /></Field>
                    <Field label="Smallest order" htmlFor="disc-min"><input id="disc-min" name="minOrder" type="number" step="0.01" min="0" className={inputClass} defaultValue="0" /></Field>
                    <Field label="Most uses (0 for no limit)" htmlFor="disc-max"><input id="disc-max" name="maxUses" type="number" min="0" className={inputClass} defaultValue="0" /></Field>
                    <Field label="Status" htmlFor="disc-status">
                      <select id="disc-status" name="status" className={selectClass} defaultValue="active">
                        <option value="active">Live</option>
                        <option value="draft">Draft</option>
                        <option value="scheduled">Scheduled</option>
                      </select>
                    </Field>
                    <Field label="Ends" htmlFor="disc-ends"><input id="disc-ends" name="expiresAt" type="datetime-local" className={inputClass} /></Field>
                  </div>
                  <div><button type="submit" className={buttonClass("ink")}>Create discount</button></div>
                </form>
              </FormCard>
            )}

            {params?.action === "generate-coupon" && (
              <FormCard title="Make coupon codes" closeHref={close}>
                <form action={generateCouponForm} className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Kind" htmlFor="gen-type">
                      <select id="gen-type" name="type" className={selectClass}>
                        {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Value" htmlFor="gen-value"><input id="gen-value" name="value" type="number" step="0.01" min="0" className={inputClass} required /></Field>
                    <Field label="How many" htmlFor="gen-count"><input id="gen-count" name="count" type="number" className={inputClass} defaultValue="1" min="1" max="50" /></Field>
                  </div>
                  <div><button type="submit" className={buttonClass("ink")}>Make codes</button></div>
                </form>
              </FormCard>
            )}

            {params?.action === "bulk-import" && (
              <FormCard title="Import coupon codes" closeHref={close}>
                <form action={bulkImportCouponsForm} className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Kind" htmlFor="imp-type">
                      <select id="imp-type" name="type" className={selectClass}>
                        {DISCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Value" htmlFor="imp-value"><input id="imp-value" name="value" type="number" step="0.01" min="0" className={inputClass} required /></Field>
                  </div>
                  <Field label="Codes, one per line" htmlFor="imp-codes">
                    <textarea id="imp-codes" name="codes" className={`${textareaClass} font-mono text-[13px]`} rows={6} placeholder={"SUMMER25\nWELCOME10\nFREESHIP"} />
                  </Field>
                  <div><button type="submit" className={buttonClass("ink")}>Import codes</button></div>
                </form>
              </FormCard>
            )}

            {offers.length ? (
              <ListCard>
                {offers.map((o) => (
                  <ListRow key={`${o.kind}-${o.id}`}>
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <div className="truncate font-mono text-[14px] font-bold">{o.code}</div>
                      <div className="truncate text-[13px] text-app-ink-soft">{o.kind === "discount" ? o.name : "Coupon code"} · {o.type}</div>
                    </div>
                    <div className="text-[13px] sm:w-[170px]">
                      <div className="font-extrabold">{o.value}</div>
                      <div className="text-app-ink-soft">{o.uses} · {o.expires}</div>
                    </div>
                    <StatusPill status={o.status} />
                    <RowActions>
                      {o.kind === "discount" && (
                        <>
                          <form action={toggleDiscountStatusForm}>
                            <input type="hidden" name="id" value={o.id} />
                            <input type="hidden" name="status" value={o.status === "active" ? "disabled" : "active"} />
                            <button type="submit" className={buttonClass("white", "sm")}>{o.status === "active" ? "Turn off" : "Turn on"}</button>
                          </form>
                          <form action={deleteDiscountForm}>
                            <input type="hidden" name="id" value={o.id} />
                            <ConfirmSubmit message={`Delete ${o.code}?`} className={buttonClass("danger", "sm")}>Delete</ConfirmSubmit>
                          </form>
                        </>
                      )}
                    </RowActions>
                  </ListRow>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="percent" title="No discounts or coupons yet">Make a code to share on WhatsApp or Instagram, or a discount that applies at checkout.</EmptyState>
            )}
          </>
        )}

        {/* Social selling */}
        {activeTab === "Social Selling" && (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {([
              { name: "WhatsApp Business", icon: "whatsapp" },
              { name: "Instagram Shopping", icon: "instagram" },
              { name: "TikTok Shop", icon: "tiktok" },
              { name: "Facebook Shop", icon: "facebook" },
            ] as Array<{ name: string; icon: IconName }>).map((channel) => (
              <Card key={channel.name} className="flex items-center gap-3 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-canvas"><Icon name={channel.icon} size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{channel.name}</div>
                  <div className="text-[13px] text-app-ink-soft">Not available yet</div>
                </div>
                <Pill tone="warning">Soon</Pill>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SellerPage>
  );
}
