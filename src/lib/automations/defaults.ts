import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { htmlFromBlocks } from "@/lib/marketing/blocks";
import { presetByKey, type FlowStep } from "@/lib/marketing/flows";

// Every shop starts with an abandoned-cart reminder (email only, no discount: the seller decides whether to
// give money away). It is created once; a seller who turns it off keeps it off (the last abandoned-cart flow
// can be switched off but not deleted, so it isn't re-created here).

export async function seedDefaultAbandonedCartAutomation(store: { id: string; name: string }) {
  const existingRule = await db.automationRule.findFirst({
    where: { storeId: store.id, trigger: "abandoned_checkout" },
    select: { id: true },
  });
  if (existingRule) return existingRule.id;

  const preset = presetByKey("abandoned_cart")!;
  const steps: FlowStep[] = preset.steps.filter((step) => step.type !== "give_discount" && step.type !== "send_whatsapp");
  // Second reminder without the discount wording.
  const lastEmail = steps.findLastIndex((step) => step.type === "send_email");
  if (lastEmail > 0) {
    steps[lastEmail] = {
      type: "send_email",
      subject: "Your cart at {{store}} is still saved",
      bodyHtml: htmlFromBlocks([
        { type: "text", text: "Hi {{name}}," },
        { type: "text", text: "Your cart is still waiting: {{cart_items}}. Items sell out, so finish your order while they are here." },
        { type: "button", label: "Finish your order", url: "{{cart_url}}" },
      ]),
    };
  }

  const rule = await db.automationRule.create({
    data: {
      storeId: store.id,
      name: "Abandoned cart recovery",
      description: "Reminds shoppers who gave their email at checkout and didn't pay: after 1 hour and again after a day.",
      trigger: "abandoned_checkout",
      actionType: "send_email",
      actionConfig: { steps, preset: "abandoned_cart" } as unknown as Prisma.InputJsonValue,
      active: true,
    },
    select: { id: true },
  });

  return rule.id;
}
