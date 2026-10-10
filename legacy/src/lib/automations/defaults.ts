import "server-only";
import { db } from "@/lib/db/client";

export async function seedDefaultAbandonedCartAutomation(store: { id: string; name: string }) {
  const existingRule = await db.automationRule.findFirst({
    where: {
      storeId: store.id,
      trigger: "abandoned_checkout",
      name: "Abandoned cart recovery",
    },
    select: { id: true },
  });
  if (existingRule) return existingRule.id;

  let template = await db.emailTemplate.findFirst({
    where: {
      storeId: store.id,
      category: "abandoned_cart",
      name: "Abandoned cart recovery",
    },
    select: { id: true },
  });

  if (!template) {
    template = await db.emailTemplate.create({
      data: {
        storeId: store.id,
        name: "Abandoned cart recovery",
        category: "abandoned_cart",
        subject: "You left something at {{store}}",
        bodyHtml: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 10px">Still thinking it over?</h2>
            <p style="color:#555;line-height:1.6">Hi {{name}}, your cart at <strong>{{store}}</strong> is still waiting.</p>
            <p style="font-weight:700">Cart subtotal: {{currency}} {{order_total}}</p>
            <p style="color:#666;line-height:1.6">Come back anytime to finish checkout before your favorites sell out.</p>
          </div>
        `,
      },
      select: { id: true },
    });
  }

  const rule = await db.automationRule.create({
    data: {
      storeId: store.id,
      name: "Abandoned cart recovery",
      description: "Automatically emails known visitors when they leave items in cart.",
      trigger: "abandoned_checkout",
      actionType: "send_email",
      actionConfig: {
        templateId: template.id,
        channel: "email",
      },
      active: true,
    },
    select: { id: true },
  });

  return rule.id;
}
