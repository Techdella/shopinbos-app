"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PILOT_ROLES, PilotProgramInput, TEXT_CHANNELS } from "@/lib/pilot/pure";
import {
  PilotNotReady,
  autoPickProgram,
  createProgram,
  decide,
  deleteProgram,
  notifyDecisions,
  sendInvites,
  sendReminders,
  setProgramClosed,
  updateProgram,
  waitlistTheRest,
} from "@/lib/pilot/service.server";

// Admin › Leads › Pilot testing: set up a pilot, invite and remind leads, pick testers and tell people the outcome.

const PATH = "/admin/pilot";
/** Leaves time to save results before the 300 s function limit; another click carries on. */
const SEND_BUDGET_MS = 240_000;

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const back = (id: string, params: Record<string, string | number>) => `${PATH}/${id}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;

function message(error: unknown) {
  if (error instanceof PilotNotReady) return error.message;
  console.error("[admin pilot]", error);
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** datetime-local in Lagos time (UTC+1) → Date. */
function lagosDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}:00+01:00`) : null;
}

function programFromForm(formData: FormData) {
  return PilotProgramInput.safeParse({
    name: field(formData, "name"),
    closesAt: lagosDate(field(formData, "closesAt")),
    roles: formData.getAll("roles").map(String).filter((r) => (PILOT_ROLES as readonly string[]).includes(r)),
    targets: Object.fromEntries(PILOT_ROLES.map((role) => [role, Number(field(formData, `target_${role}`) || 0)])),
    includeNoConsent: formData.get("includeNoConsent") === "on",
    textChannel: (TEXT_CHANNELS as readonly string[]).includes(field(formData, "textChannel")) ? field(formData, "textChannel") : "sms",
  });
}

export async function savePilotProgram(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const id = field(formData, "id").slice(0, 64);
  const parsed = programFromForm(formData);
  const errorTo = id ? `${PATH}/${id}?` : `${PATH}?`;
  if (!parsed.success) redirect(`${errorTo}error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  if (!id && parsed.data.closesAt <= new Date()) redirect(`${errorTo}error=${encodeURIComponent("The reply deadline must be in the future.")}`);
  let saved: { id: string };
  try {
    saved = id ? await updateProgram(id, parsed.data) : await createProgram(parsed.data, admin.id);
  } catch (error) {
    redirect(`${errorTo}error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(PATH);
  redirect(back(saved.id, { saved: 1 }));
}

export async function deletePilotProgram(formData: FormData) {
  await requireAdminSection("leads");
  await deleteProgram(field(formData, "id")).catch(() => null);
  revalidatePath(PATH);
  redirect(PATH);
}

export async function invitePilotLeads(formData: FormData) {
  await requireAdminSection("leads");
  const id = field(formData, "id");
  let to: string;
  try {
    const result = await sendInvites(id, Date.now() + SEND_BUDGET_MS);
    to = back(id, { invited: result.sent, failed: result.failed, remaining: result.remaining });
  } catch (error) {
    to = back(id, { error: message(error) });
  }
  revalidatePath(`${PATH}/${id}`);
  redirect(to);
}

export async function remindPilotLeads(formData: FormData) {
  await requireAdminSection("leads");
  const id = field(formData, "id");
  let to: string;
  try {
    const result = await sendReminders(id, Date.now() + SEND_BUDGET_MS);
    to = back(id, { reminded: result.sent, failed: result.failed, remaining: result.remaining });
  } catch (error) {
    to = back(id, { error: message(error) });
  }
  revalidatePath(`${PATH}/${id}`);
  redirect(to);
}

export async function setPilotClosed(formData: FormData) {
  await requireAdminSection("leads");
  const id = field(formData, "id");
  const closed = field(formData, "closed") === "1";
  const updated = await setProgramClosed(id, closed).catch(() => ({ count: 0 }));
  revalidatePath(`${PATH}/${id}`);
  redirect(updated.count ? back(id, { saved: 1 }) : back(id, { error: "Move the deadline later to open replies again." }));
}

export async function decidePilotApplicant(formData: FormData) {
  await requireAdminSection("leads");
  const status = field(formData, "status");
  if (status !== "selected" && status !== "waitlisted" && status !== "applied") return;
  const programId = await decide(field(formData, "applicantId"), status).catch(() => null);
  if (!programId) return;
  revalidatePath(`${PATH}/${programId}`);
  redirect(`${PATH}/${programId}?${field(formData, "view")}#a-${field(formData, "applicantId")}`);
}

export async function autoPickPilot(formData: FormData) {
  await requireAdminSection("leads");
  const id = field(formData, "id");
  const picked = await autoPickProgram(id).catch(() => 0);
  revalidatePath(`${PATH}/${id}`);
  redirect(back(id, { picked }));
}

export async function waitlistPilotRest(formData: FormData) {
  await requireAdminSection("leads");
  const id = field(formData, "id");
  const moved = await waitlistTheRest(id).catch(() => 0);
  revalidatePath(`${PATH}/${id}`);
  redirect(back(id, { waitlistedRest: moved }));
}

export async function notifyPilotDecisions(formData: FormData) {
  await requireAdminSection("leads");
  const id = field(formData, "id");
  let to: string;
  try {
    const result = await notifyDecisions(id, Date.now() + SEND_BUDGET_MS);
    to = back(id, { notifiedIn: result.selected, notifiedWave: result.waitlisted, failed: result.failed, remaining: result.remaining });
  } catch (error) {
    to = back(id, { error: message(error) });
  }
  revalidatePath(`${PATH}/${id}`);
  redirect(to);
}
