import "server-only";
import { triggerFlows, type TriggerContext } from "./flow-engine";

// Entry point the order, payment and checkout code calls when something happens in a shop. Flows (steps,
// waits, conditions) live in ./flow-engine; this keeps the original signature for every caller.

export type AutomationContext = TriggerContext;

export async function triggerAutomations(event: string, context: AutomationContext): Promise<void> {
  // Abandoned carts are enrolled from AbandonedCartEvent rows by the cron sweep (it knows the cart and its
  // recovery link, and waits until the shopper has really left).
  if (event === "abandoned_checkout") return;
  try {
    await triggerFlows(event, context);
  } catch (error) {
    console.error(`[automations] ${event} failed`, error);
  }
}
