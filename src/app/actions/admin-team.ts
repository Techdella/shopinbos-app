"use server";

import { revalidatePath } from "next/cache";
import { TeamError, changeTeamRole, inviteTeamMember, removeTeamMember, requireAdminSection } from "@/lib/admin-team/service.server";

// Admin › Team. Owners only (the service checks again, so a hand-made call from another page can't skip it).

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(work: () => Promise<string | undefined>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath("/admin/team");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof TeamError) return { ok: false, error: error.message };
    console.error("[admin-team]", error);
    return { ok: false, error: "That didn't save. Try again." };
  }
}

export async function inviteTeamMemberAction(input: { name: string; email: string; role: string }) {
  const user = await requireAdminSection("team");
  return run(async () => {
    const { emailed } = await inviteTeamMember(user, input);
    return emailed ? `Added. We've emailed ${input.email.trim()} how to sign in.` : `Added. Email isn't set up, so tell them to sign in at /admin/login with ${input.email.trim()} and an emailed code.`;
  });
}

export async function changeTeamRoleAction(userId: string, role: string) {
  const user = await requireAdminSection("team");
  return run(async () => {
    await changeTeamRole(user, userId, role);
    return "Role changed. It applies on their next click.";
  });
}

export async function removeTeamMemberAction(userId: string) {
  const user = await requireAdminSection("team");
  return run(async () => {
    await removeTeamMember(user, userId);
    return "Removed. They're signed out of the admin portal.";
  });
}
