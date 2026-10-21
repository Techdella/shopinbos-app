"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import {
  connectPartner,
  endConnection,
  respondToPrivateRateCard,
  saveDeliverySettings,
  updateConnection,
  type SettingsInput,
} from "@/lib/delivery-market/manage.server";
import { markJobReady, reassignJob, sellerConfirmsCash } from "@/lib/delivery-market/jobs.server";

// Logistics marketplace forms for sellers (/home/logistics/*, the order page) and suppliers (/supplier/delivery):
// delivery settings, delivery partners (connect, what customers see, pay on delivery, remove), private rates, and
// the shop's delivery jobs (ready for pickup, send to another partner, pay-on-delivery cash). Every form posts a
// `back` path; we return there with ?saved=… or ?error=….

const BACK_PATHS = /^\/(home\/logistics|home\/orders|supplier\/delivery)(\/[A-Za-z0-9_\-]+)*$/;

const str = (value: FormDataEntryValue | null, max = 200) => String(value ?? "").trim().slice(0, max);
const on = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";

function backOf(formData: FormData, fallback: string) {
  const raw = str(formData.get("back"), 200);
  const [path, hash] = raw.split("#");
  return { path: path && BACK_PATHS.test(path) ? path : fallback, hash: hash && /^[a-z0-9-]{1,40}$/i.test(hash) ? hash : "" };
}

function done(formData: FormData, fallback: string, result: { ok: true } | { ok: false; error: string }, savedText: string): never {
  const back = backOf(formData, fallback);
  revalidatePath(back.path);
  const query = result.ok ? `saved=${encodeURIComponent(savedText)}` : `error=${encodeURIComponent(result.error)}`;
  redirect(`${back.path}?${query}${back.hash ? `#${back.hash}` : ""}`);
}

async function business() {
  const user = await requireRole(["seller", "supplier"], "/login");
  return { user, home: user.role === "supplier" ? "/supplier/delivery" : "/home/logistics/partners" };
}

async function seller() {
  return requireRole(["seller"], "/login");
}

// ─── Delivery settings ───────────────────────────────────────────────────────

export async function saveDeliverySettingsAction(formData: FormData) {
  const user = await requireRole(["seller", "supplier"], "/login");
  const fallback = user.role === "supplier" ? "/supplier/delivery" : "/home/logistics/settings";
  const where: SettingsInput = {
    originState: str(formData.get("originState"), 40),
    originArea: str(formData.get("originArea"), 80),
    originAddress: str(formData.get("originAddress"), 200),
    defaultSizeBand: str(formData.get("defaultSizeBand"), 20),
  };
  // Suppliers only say where they ship from; checkout choices are the shop's.
  const input: SettingsInput =
    user.role === "supplier"
      ? where
      : (() => {
          const sellArea = str(formData.get("sellArea"), 20);
          return {
            ...where,
            sellArea,
            sellStates: sellArea === "one_state" ? [str(formData.get("oneState"), 40)].filter(Boolean) : formData.getAll("sellStates").map((value) => str(value, 40)),
            checkoutMode: str(formData.get("checkoutMode"), 20),
            selfPickup: on(formData, "selfPickup"),
            pickupAddress: str(formData.get("pickupAddress"), 200),
            pickupHours: str(formData.get("pickupHours"), 120),
            pickupInstructions: str(formData.get("pickupInstructions"), 300),
            fallback: str(formData.get("fallback"), 20),
            fallbackFee: str(formData.get("fallbackFee"), 20) || "0",
            failedFeePayer: str(formData.get("failedFeePayer"), 20),
          };
        })();
  const result = await saveDeliverySettings(user.id, input);
  revalidatePath("/home/logistics");
  done(formData, fallback, result, "Delivery settings saved.");
}

// ─── Delivery partners ───────────────────────────────────────────────────────

export async function connectPartnerAction(formData: FormData) {
  const { user, home } = await business();
  const result = await connectPartner({ id: user.id, role: user.role }, str(formData.get("partnerId"), 40));
  done(formData, home, result.ok ? { ok: true } : result, "Partner added. Their public rates now price your deliveries with them.");
}

export async function updateConnectionAction(formData: FormData) {
  const { user, home } = await business();
  const result = await updateConnection(user.id, str(formData.get("connectionId"), 40), {
    services: formData.getAll("services").map((value) => str(value, 20)),
    showPartnerName: formData.get("showPartnerName") === "true",
    label: str(formData.get("label"), 40),
    ownerPod: on(formData, "ownerPod"),
    acceptPodDisclaimer: on(formData, "acceptPodDisclaimer"),
  });
  done(formData, home, result, "Partner settings saved.");
}

export async function endConnectionAction(formData: FormData) {
  const { user, home } = await business();
  const result = await endConnection({ userId: user.id, side: "owner" }, str(formData.get("connectionId"), 40));
  done(formData, home, result, "Partner removed. Jobs already sent to them carry on.");
}

export async function respondRateCardAction(formData: FormData) {
  const { user, home } = await business();
  const accept = formData.get("decision") === "accept";
  const result = await respondToPrivateRateCard(user.id, str(formData.get("cardId"), 40), accept);
  done(formData, home, result, accept ? "Private rates accepted. New orders use them." : "Private rates declined. Their public rates still apply.");
}

// ─── The shop's delivery jobs ────────────────────────────────────────────────

export async function markJobReadyAction(formData: FormData) {
  const user = await seller();
  const result = await markJobReady(user.id, str(formData.get("bookingId"), 40));
  revalidatePath("/home/logistics/exceptions");
  done(formData, "/home/logistics/exceptions", result, "Marked ready. Your partner knows they can collect it.");
}

export async function reassignJobAction(formData: FormData) {
  const user = await seller();
  const connectionId = str(formData.get("connectionId"), 40);
  const result = connectionId
    ? await reassignJob(user.id, str(formData.get("bookingId"), 40), connectionId)
    : { ok: false as const, error: "Pick the partner to send it to." };
  revalidatePath("/home/logistics");
  done(formData, "/home/logistics/exceptions", result.ok ? { ok: true } : result, "Sent to the new partner. They have a few hours to accept.");
}

export async function confirmCashAction(formData: FormData) {
  const user = await seller();
  const result = await sellerConfirmsCash(user.id, str(formData.get("bookingId"), 40));
  done(formData, "/home/logistics/exceptions", result.ok ? { ok: true } : result, "Thanks. We've noted that you got the cash.");
}
