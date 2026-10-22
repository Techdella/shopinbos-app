import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getSetupOverview, setPaymentMethods, SetupError, upsertDeliveryArea } from "@/lib/setup/server";
import { naira, PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import type { PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's shop-setup tools, run from the Start here page's "Ask Peggy" panel or the full Peggy chat.
// They use the same writes as the Start here page, so a change Peggy makes ticks the checklist at once.

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((method) => [method.key, method.label])) as Record<PaymentMethodKey, string>;

async function logSetup(ctx: PeggyToolContext, tool: string, title: string, description: string, link: string) {
  await db.activityEvent
    .create({
      data: {
        storeId: ctx.store.id,
        userId: ctx.userId,
        type: "settings",
        title,
        description,
        metadata: { source: "peggy", tool, link } as Prisma.InputJsonValue,
      },
    })
    .catch((error) => console.error("[peggy] activity log failed", error));
}

async function setupStatus(ctx: PeggyToolContext): Promise<ToolOutput> {
  const overview = await getSetupOverview(ctx.userId);
  if (!overview) throw new ToolError("This seller has no shop yet.");
  const { checklist } = overview;
  return {
    content: JSON.stringify({
      progress: `${checklist.done} of ${checklist.total} required steps done${checklist.complete ? " (setup complete)" : ""}`,
      next: checklist.next ? checklist.next.title : null,
      steps: checklist.steps.map((step) => ({
        step: step.title,
        status: step.done ? "done" : step.skipped ? "skipped" : "open",
        optional: step.optional,
        note: step.hint,
        whereToDoIt: step.action.kind === "link" ? step.action.href : "/home/start",
      })),
      paymentMethods: Object.fromEntries(Object.entries(overview.payments).map(([key, on]) => [METHOD_LABEL[key as PaymentMethodKey] ?? key, on ? "on" : "off"])),
      deliveryAreas: overview.zones.map((zone) => ({ name: zone.name, fee: naira(zone.fee), covers: zone.regions.length ? zone.regions.join(", ") : "everywhere else" })),
      storeLink: overview.store.url,
      note: "You can change payment methods (setup_payment_methods) and delivery areas (setup_delivery_area). Payout bank, going live (free: the seller presses Publish), domain and products are done by the seller on /home/start or the linked screens.",
    }),
  };
}

async function setupPaymentMethods(ctx: PeggyToolContext, input: PeggyToolInput<"setup_payment_methods">): Promise<ToolOutput> {
  const changes = Object.fromEntries(Object.entries(input).filter(([, on]) => typeof on === "boolean")) as Partial<Record<PaymentMethodKey, boolean>>;
  let next: Record<PaymentMethodKey, boolean>;
  try {
    next = await setPaymentMethods(ctx.store.id, changes);
  } catch (error) {
    if (error instanceof SetupError) throw new ToolError(error.message);
    throw error;
  }
  const on = (Object.keys(next) as PaymentMethodKey[]).filter((key) => next[key]).map((key) => METHOD_LABEL[key]);
  const changed = (Object.keys(changes) as PaymentMethodKey[]).map((key) => `${METHOD_LABEL[key]} ${changes[key] ? "on" : "off"}`);
  const summary = `Payment methods updated: ${changed.join(", ")}. Customers can now pay by ${on.join(", ")}.`;
  await logSetup(ctx, "setup_payment_methods", "Peggy updated payment methods", summary, "/home/payments");
  return { content: `${summary}${next.transfer ? " Bank transfer shows the seller's payout account, so they need a payout bank added." : ""}`, action: { summary, href: "/home/payments" } };
}

async function setupDeliveryArea(ctx: PeggyToolContext, input: PeggyToolInput<"setup_delivery_area">): Promise<ToolOutput> {
  let saved: Awaited<ReturnType<typeof upsertDeliveryArea>>;
  try {
    saved = await upsertDeliveryArea(ctx.store.id, input);
  } catch (error) {
    if (error instanceof SetupError) throw new ToolError(error.message);
    throw error;
  }
  const covers = saved.regions.length ? saved.regions.join(", ") : "everywhere else";
  const summary = `${saved.created ? "Added" : "Updated"} delivery area ${saved.name}: ${naira(saved.fee)}, covering ${covers}.`;
  await logSetup(ctx, "setup_delivery_area", `Peggy ${saved.created ? "added" : "updated"} delivery to ${saved.name}`, summary, "/home/shipping");
  return { content: summary, action: { summary, href: "/home/shipping" } };
}

export const SETUP_TOOL_RUNNERS = {
  setup_status: setupStatus,
  setup_payment_methods: setupPaymentMethods,
  setup_delivery_area: setupDeliveryArea,
};
