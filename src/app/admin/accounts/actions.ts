"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { isFullAdmin } from "@/lib/admin-team/pure";
import { AccountError, saveAccountDetails, setPilotFeatures } from "@/lib/admin/accounts.server";
import { FIELDS_BY_ROLE } from "@shared/admin-accounts";

// Admin › Accounts. The rules and the logs are in src/lib/admin/accounts.server.ts.

const PAGE = "/admin/accounts";

async function run(userId: string, anchor: string, work: () => Promise<string>) {
  let params: Record<string, string>;
  try {
    params = { saved: await work() };
  } catch (error) {
    if (!(error instanceof AccountError)) throw error;
    params = { error: error.message };
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?${new URLSearchParams({ user: userId, ...params, at: anchor }).toString()}#${anchor}`);
}

/** A team member's change to someone's details (name, phone, city, business name and contact details). */
export async function saveAccountDetailsAction(formData: FormData) {
  const admin = await requireAdminSection("partners");
  const userId = String(formData.get("userId") ?? "");
  const fields = new Set(Object.values(FIELDS_BY_ROLE).flat());
  const raw = Object.fromEntries([...fields].map((field) => [field, formData.get(field)]));
  await run(userId, "details", async () => {
    const { changed } = await saveAccountDetails({ adminId: admin.id, userId, raw, reason: String(formData.get("reason") ?? "") });
    return changed.length ? "Details saved." : "Nothing changed.";
  });
}

/** Which pilot features this person tests (owners and admins, like Admin › Pilot features). */
export async function savePilotTesterAction(formData: FormData) {
  const admin = await requireAdminSection("partners");
  const userId = String(formData.get("userId") ?? "");
  if (!isFullAdmin(admin.adminRole)) redirect(`${PAGE}?${new URLSearchParams({ user: userId, error: "Only owners and admins choose pilot testers.", at: "pilot" }).toString()}#pilot`);
  const keys = formData.getAll("feature").map(String);
  await run(userId, "pilot", async () => {
    const { added, removed } = await setPilotFeatures({ adminId: admin.id, userId, keys });
    if (!added && !removed) return "Nothing changed.";
    return keys.length ? `Pilot tester of ${keys.length} feature${keys.length === 1 ? "" : "s"}.` : "No longer a pilot tester.";
  });
}
