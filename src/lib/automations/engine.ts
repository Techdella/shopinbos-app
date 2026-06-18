import "server-only";
import { db } from "@/lib/db/client";
import { sendEmail } from "@/lib/notifications/resend";

type AutomationContext = {
  storeId: string;
  storeName: string;
  buyerEmail?: string;
  buyerName?: string;
  orderNumber?: string;
  orderTotal?: number;
  currency?: string;
  [key: string]: unknown;
};

type ActionConfig = {
  templateId?: string;
  subject?: string;
  body?: string;
  channel?: string;
};

type AutomationRule = {
  id: string;
  trigger: string;
  actionType: string;
  actionConfig: string;
};

export async function triggerAutomations(
  event: string,
  context: AutomationContext,
): Promise<void> {
  const rules = await db.$queryRawUnsafe<AutomationRule[]>(
    `SELECT id, trigger, "actionType", "actionConfig"::text FROM "AutomationRule" WHERE "storeId" = $1 AND trigger = $2 AND active = true`,
    context.storeId, event,
  );

  if (!rules || rules.length === 0) return;

  const templateIds = rules
    .map((r) => {
      try {
        const cfg: ActionConfig = JSON.parse(r.actionConfig);
        return cfg.templateId;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as string[];

  let templates: Map<string, { subject: string; bodyHtml: string }> = new Map();
  if (templateIds.length > 0) {
    const placeholders = templateIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.$queryRawUnsafe<Array<{ id: string; subject: string; bodyHtml: string }>>(
      `SELECT id, subject, "bodyHtml" FROM "EmailTemplate" WHERE id = ANY(ARRAY[${placeholders}])`,
      ...templateIds,
    );
    for (const t of rows) templates.set(t.id, t);
  }

  for (const rule of rules) {
    try {
      const cfg: ActionConfig = JSON.parse(rule.actionConfig);
      await executeAction(rule.actionType, cfg, templates, context);
    } catch (err) {
      console.error(`Automation rule ${rule.id} failed:`, err);
    }
  }
}

async function executeAction(
  actionType: string,
  cfg: ActionConfig,
  templates: Map<string, { subject: string; bodyHtml: string }>,
  ctx: AutomationContext,
): Promise<void> {
  switch (actionType) {
    case "send_email": {
      if (!ctx.buyerEmail) return;

      let subject = cfg.subject || "";
      let html = cfg.body || "";

      if (cfg.templateId && templates.has(cfg.templateId)) {
        const tpl = templates.get(cfg.templateId)!;
        if (!subject) subject = tpl.subject;
        if (!html) html = tpl.bodyHtml;
      }

      if (!subject || !html) return;

      subject = fillTemplate(subject, ctx);
      html = fillTemplate(html, ctx);

      await sendEmail({
        to: [ctx.buyerEmail],
        subject,
        html,
      });
      break;
    }

    case "send_notification": {
      const channel = cfg.channel || "in_app";
      if (channel === "email" || channel === "both") {
        if (ctx.buyerEmail) {
          let subject = cfg.subject || "Update from " + ctx.storeName;
          let html = cfg.body || `<p>Hi ${ctx.buyerName || "there"}, check out what's new.</p>`;
          subject = fillTemplate(subject, ctx);
          html = fillTemplate(html, ctx);
          await sendEmail({
            to: [ctx.buyerEmail],
            subject,
            html,
          });
        }
      }
      if (channel === "in_app" || channel === "both") {
        await db.$executeRawUnsafe(
          `INSERT INTO "Notification" (id, "userId", title, body, type) VALUES (gen_random_uuid()::text, $1, $2, $3, 'automation')`,
          ctx.storeId,
          fillTemplate(cfg.subject || "Automation triggered", ctx),
          fillTemplate(cfg.body || "An automation rule was triggered.", ctx),
        );
      }
      break;
    }

    case "update_discount": {
      // Activate a discount matching the store
      // Future: potentially activate a specific discount by name/code from cfg
      break;
    }

    case "add_tag": {
      // Future: customer tagging system
      break;
    }
  }
}

function fillTemplate(text: string, ctx: AutomationContext): string {
  return text
    .replace(/\{\{name\}\}/g, ctx.buyerName || "there")
    .replace(/\{\{store\}\}/g, ctx.storeName)
    .replace(/\{\{order_number\}\}/g, ctx.orderNumber || "")
    .replace(/\{\{order_total\}\}/g, ctx.orderTotal?.toLocaleString() || "")
    .replace(/\{\{currency\}\}/g, ctx.currency || "NGN");
}
