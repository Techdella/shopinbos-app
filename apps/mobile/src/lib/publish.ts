import { api } from "./api";
import { fetchSetup } from "./setup";

// Putting the shop live from the phone: POST /api/store/editor/publish (src/lib/store-publishing.ts publishStoreDraft,
// the same route as the web builder's Publish). It copies the draft design to the live shop and sets the store
// active and LIVE; publishing is free on every plan. Every publish button in the app (onboarding, Start here, Rex's
// "Changed your draft" card, Shop looks "Put it live", My shop and Edit my shop) goes through publishShop, so they
// all show the same "Your shop is live" sheet, or the server's own reason when it can't go live (an empty homepage,
// say), never a silent failure.

export interface PublishedShop {
  name: string;
  url: string | null;
}

export async function publishShop(): Promise<PublishedShop> {
  await api<unknown>("/api/store/editor/publish", { method: "POST" });
  const overview = await fetchSetup().catch(() => null);
  return { name: overview?.store.name ?? "", url: overview?.store.url ?? null };
}

/** Whether the shop is live, from Start here's "Put your shop live" step (the same rule as the web). */
export function shopIsLive(overview: { checklist: { steps: Array<{ key: string; done: boolean }> } } | null | undefined): boolean | null {
  const step = overview?.checklist.steps.find((entry) => entry.key === "live");
  return step ? step.done : null;
}
